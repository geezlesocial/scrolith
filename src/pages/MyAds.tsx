import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  Filter,
  Globe2,
  LayoutTemplate,
  Megaphone,
  MousePointerClick,
  PauseCircle,
  PencilLine,
  PlayCircle,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wallet
} from 'lucide-react';
import { AdService } from '../services/ads';
import { CommunityService } from '../services/community';
import { AdCampaign } from '../types';
import { useNotification } from '../context/NotificationContext';
import { useCurrency } from '../context/CurrencyContext';
import { useUser } from '../context/UserContext';
import FilePickerModal from '../dashboard/shared/FilePickerModal';
import AdVideoPlayer from '../components/ads/AdVideoPlayer';
import { PaymentService } from '../services/payment';
import { PaymentGateway } from '../types';
import { getUserFacingPaymentMethodName } from '../utils/paymentGatewayDisplay';
import { DEFAULT_AD_TARGET_COUNTRIES } from '../constants/defaultAudienceOptions';
import { resolveAssetUrl } from '../utils/assetUrl';
import {
  resolvePostAttachmentMediaUrl,
  resolvePostAttachmentPosterUrl
} from '../utils/postAttachmentMedia';

const toNumber = (value: any): number => {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const CAMPAIGN_DAY_MS = 24 * 60 * 60 * 1000;

const formatCurrency = (amount: number, code?: string) => {
  const currency = code || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch (e) {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

const DEFAULT_ALLOWED_PLACEMENTS = [
  'homepage',
  'homepage_feed',
  'community_feed',
  'scroll_preroll',
  'scroll_feed',
  'forum_listing',
  'thread_detail',
  'chat_sidebar'
];

const PLACEMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'homepage', label: 'Homepage' },
  { value: 'homepage_feed', label: 'Homepage Feed' },
  { value: 'community_feed', label: 'Community Feed' },
  { value: 'scroll_preroll', label: 'Scroll Pre-roll' },
  { value: 'scroll_feed', label: 'Scroll Feed Overlay' },
  { value: 'forum_listing', label: 'Forum Listing' },
  { value: 'thread_detail', label: 'Thread Detail' },
  { value: 'chat_sidebar', label: 'Chat Side Bar' }
];

const getPlacementLabel = (placement: string) =>
  PLACEMENT_OPTIONS.find((option) => option.value === placement)?.label || placement;

type StudioStatusFilter = 'all' | 'active' | 'draft' | 'review' | 'action' | 'paused' | 'ended';
type StudioSortMode = 'recent' | 'budget_high' | 'spend_high' | 'best_ctr' | 'attention';

const STATUS_FILTER_OPTIONS: Array<{ value: StudioStatusFilter; label: string }> = [
  { value: 'all', label: 'All campaigns' },
  { value: 'active', label: 'Active' },
  { value: 'action', label: 'Needs action' },
  { value: 'review', label: 'In review' },
  { value: 'draft', label: 'Drafts' },
  { value: 'paused', label: 'Paused' },
  { value: 'ended', label: 'Ended' }
];

const SORT_OPTIONS: Array<{ value: StudioSortMode; label: string }> = [
  { value: 'recent', label: 'Most recent' },
  { value: 'attention', label: 'Highest priority' },
  { value: 'budget_high', label: 'Highest budget' },
  { value: 'spend_high', label: 'Most spent' },
  { value: 'best_ctr', label: 'Best CTR' }
];

const normalizeCampaignStatus = (status?: string) =>
  String(status || '')
    .toLowerCase()
    .replace(/-/g, '_')
    .trim();

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const formatCompactNumber = (value: number) => {
  try {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: value >= 1000 ? 1 : 0
    }).format(value);
  } catch {
    return String(value);
  }
};

const formatDateLabel = (value?: string | null) => {
  if (!value) return 'Not scheduled';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not scheduled';
  return parsed.toLocaleDateString();
};

const getCampaignTargeting = (ad: AdCampaign): Record<string, any> => {
  if (!ad?.targeting || typeof ad.targeting !== 'object' || Array.isArray(ad.targeting)) {
    return {};
  }
  return ad.targeting as Record<string, any>;
};

const getCampaignPlacements = (ad: AdCampaign): string[] => {
  const targeting = getCampaignTargeting(ad);
  const placementsSource =
    Array.isArray(targeting.placements) && targeting.placements.length > 0
      ? targeting.placements
      : Array.isArray(ad.placements) && ad.placements.length > 0
        ? ad.placements
        : [ad.placement || 'community_feed'];
  return Array.from(
    new Set(
      placementsSource
        .map((placement: any) => normalizePlacement(placement))
        .filter(Boolean)
    )
  );
};

const getCampaignCountries = (ad: AdCampaign): string[] => {
  const targeting = getCampaignTargeting(ad);
  const countriesSource =
    Array.isArray(targeting.targetCountries) && targeting.targetCountries.length > 0
      ? targeting.targetCountries
      : Array.isArray(ad.targetCountries) && ad.targetCountries.length > 0
        ? ad.targetCountries
        : [];
  return Array.from(
    new Set(
      countriesSource
        .map((entry: any) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
};

const getCampaignAudience = (ad: AdCampaign): 'users' | 'businesses' | 'all' => {
  const targeting = getCampaignTargeting(ad);
  const audience = String(targeting.targetAudience || ad.targetAudience || 'users')
    .trim()
    .toLowerCase();
  if (audience === 'businesses' || audience === 'all') return audience;
  return 'users';
};

const getCampaignDailySpend = (ad: AdCampaign): number => {
  const targeting = getCampaignTargeting(ad);
  return toNumber(targeting.dailySpend ?? ad.dailySpend ?? 0);
};

const getCampaignPrimaryMedia = (ad: AdCampaign) => {
  const media =
    Array.isArray(ad.media) && ad.media.length > 0
      ? ad.media[0]
      : ad.creativeUrl
        ? { url: ad.creativeUrl, type: 'image', mimeType: 'image/*' }
        : null;

  const mediaType = isAdVideoMedia(media) ? 'video' : 'image';

  return {
    url: mediaType === 'video' ? resolveAdPreviewMediaUrl(media) : resolveAdPreviewPosterUrl(media) || resolveAdPreviewMediaUrl(media),
    type: mediaType,
    name: String(media?.name || ad.title || 'Creative').trim()
  };
};

const isAdVideoMedia = (media: any) => {
  const type = String(media?.mimeType || media?.type || '').toLowerCase();
  const url = String(media?.url || '').toLowerCase();
  return type === 'video' || type.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogg)(\?|$)/i.test(url);
};

const normalizeAdStoragePathCandidate = (value: unknown) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (isResolvedAdMediaValue(trimmed)) return trimmed;
  return `/uploads/${trimmed.replace(/^\/+/, '')}`;
};

const normalizeAdMediaAttachment = (media: any) => {
  if (!media) return null;
  const fileId = String(media?.fileId || media?.file_id || media?.id || '').trim();
  const resolvedPathCandidate = isResolvedAdMediaValue(media?.path) ? String(media.path).trim() : '';
  const storagePathCandidate = normalizeAdStoragePathCandidate(
    media?.storagePath || media?.storage_path || media?.storageKey || media?.storage_key || ''
  );
  const directMediaUrl =
    media?.url ||
    media?.downloadUrl ||
    media?.download_url ||
    media?.fileUrl ||
    media?.file_url ||
    media?.contentUrl ||
    media?.content_url ||
    media?.resolvedUrl ||
    media?.resolved_url ||
    media?.imageUrl ||
    media?.image_url ||
    '';

  return {
    ...media,
    id: String(media?.id || fileId).trim(),
    fileId,
    file_id: fileId,
    url: directMediaUrl || storagePathCandidate || resolvedPathCandidate || '',
    downloadUrl:
      media?.downloadUrl ||
      media?.download_url ||
      media?.url ||
      media?.fileUrl ||
      media?.file_url ||
      media?.contentUrl ||
      media?.content_url ||
      storagePathCandidate ||
      resolvedPathCandidate ||
      '',
    path: resolvedPathCandidate || storagePathCandidate || '',
    thumbnailUrl:
      media?.thumbnailUrl ||
      media?.thumbnail_url ||
      media?.previewUrl ||
      media?.preview_url ||
      media?.posterUrl ||
      media?.poster_url ||
      '',
    thumbnail_url:
      media?.thumbnail_url ||
      media?.thumbnailUrl ||
      media?.preview_url ||
      media?.previewUrl ||
      '',
    thumbnailFileId:
      media?.thumbnailFileId ||
      media?.thumbnail_file_id ||
      media?.posterId ||
      media?.poster_id ||
      '',
    thumbnail_file_id:
      media?.thumbnail_file_id ||
      media?.thumbnailFileId ||
      media?.poster_id ||
      media?.posterId ||
      ''
  };
};

const isResolvedAdMediaValue = (value: unknown) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  const normalized = trimmed.toLowerCase();
  return (
    /^https?:\/\//i.test(trimmed) ||
    normalized.startsWith('/api/files/') ||
    normalized.startsWith('api/files/') ||
    normalized.startsWith('/files/content/') ||
    normalized.startsWith('files/content/') ||
    normalized.startsWith('/uploads/') ||
    normalized.startsWith('uploads/')
  );
};

const pickResolvedAdMediaUrl = (media: any, keys: string[]) => {
  if (!media) return '';
  for (const key of keys) {
    const candidate = String(media?.[key] || '').trim();
    if (!isResolvedAdMediaValue(candidate)) continue;
    return resolveAssetUrl(candidate) || candidate;
  }
  return '';
};

const resolveAdPreviewMediaUrl = (media: any) => {
  const normalizedMedia = normalizeAdMediaAttachment(media);
  if (!normalizedMedia) return '';
  const resolvedMediaUrl = pickResolvedAdMediaUrl(normalizedMedia, [
    'url',
    'downloadUrl',
    'download_url',
    'fileUrl',
    'file_url',
    'contentUrl',
    'content_url',
    'resolvedUrl',
    'resolved_url',
    'imageUrl',
    'image_url',
    'previewUrl',
    'preview_url',
    'path',
    'storagePath',
    'storage_path'
  ]);
  if (resolvedMediaUrl) return resolvedMediaUrl;
  const directUrl = resolvePostAttachmentMediaUrl(normalizedMedia);
  if (directUrl) return directUrl;
  return resolveAssetUrl(
    String(
      normalizedMedia?.imageUrl ||
        normalizedMedia?.image_url ||
        normalizedMedia?.previewUrl ||
        normalizedMedia?.preview_url ||
        normalizedMedia?.thumbnailUrl ||
        normalizedMedia?.thumbnail_url ||
        ''
    ).trim()
  );
};

const resolveAdPreviewPosterUrl = (media: any) => {
  const normalizedMedia = normalizeAdMediaAttachment(media);
  if (!normalizedMedia) return '';
  const resolvedPosterUrl = pickResolvedAdMediaUrl(normalizedMedia, [
    'thumbnailUrl',
    'thumbnail_url',
    'posterUrl',
    'poster_url',
    'previewUrl',
    'preview_url',
    'thumbnailFileUrl',
    'thumbnail_file_url'
  ]);
  if (resolvedPosterUrl) return resolvedPosterUrl;
  return resolvePostAttachmentPosterUrl(normalizedMedia) || resolveAdPreviewMediaUrl(normalizedMedia);
};

const resolveAdRenderablePreviewUrl = (media: any) => {
  if (!media) return '';
  if (isAdVideoMedia(media)) return resolveAdPreviewMediaUrl(media);
  return resolveAdPreviewPosterUrl(media) || resolveAdPreviewMediaUrl(media);
};

const getStatusGroup = (status?: string): Exclude<StudioStatusFilter, 'all'> => {
  const normalized = normalizeCampaignStatus(status);
  if (normalized === 'active') return 'active';
  if (normalized === 'paused') return 'paused';
  if (normalized === 'ended' || normalized === 'completed') return 'ended';
  if (['submitted_for_review', 'approved'].includes(normalized)) return 'review';
  if (normalized === 'draft') return 'draft';
  return 'action';
};

const getStatusMeta = (status?: string) => {
  const normalized = normalizeCampaignStatus(status);
  if (normalized === 'active') {
    return {
      label: 'Active',
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      toneClass: 'bg-emerald-500',
      description: 'Serving impressions and clicks live.'
    };
  }
  if (normalized === 'paused') {
    return {
      label: 'Paused',
      badgeClass: 'border-slate-200 bg-slate-100 text-slate-700',
      toneClass: 'bg-slate-400',
      description: 'Ready to resume without rebuilding.'
    };
  }
  if (normalized === 'submitted_for_review' || normalized === 'approved') {
    return {
      label: normalized === 'approved' ? 'Approved' : 'In review',
      badgeClass: 'border-indigo-200 bg-indigo-50 text-indigo-700',
      toneClass: 'bg-indigo-500',
      description: normalized === 'approved' ? 'Approved and awaiting activation.' : 'Queued for moderation review.'
    };
  }
  if (normalized === 'ended' || normalized === 'completed') {
    return {
      label: 'Ended',
      badgeClass: 'border-slate-200 bg-slate-50 text-slate-600',
      toneClass: 'bg-slate-300',
      description: 'Campaign flight has finished.'
    };
  }
  if (normalized === 'paid') {
    return {
      label: 'Paid',
      badgeClass: 'border-cyan-200 bg-cyan-50 text-cyan-700',
      toneClass: 'bg-cyan-500',
      description: 'Funding completed. Ready for review submission.'
    };
  }
  if (normalized === 'rejected') {
    return {
      label: 'Rejected',
      badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
      toneClass: 'bg-rose-500',
      description: 'Needs revision before it can run.'
    };
  }
  if (normalized === 'awaiting_payment') {
    return {
      label: 'Awaiting payment',
      badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
      toneClass: 'bg-amber-500',
      description: 'Funding is required before launch.'
    };
  }
  return {
    label: 'Draft',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
    toneClass: 'bg-slate-500',
    description: 'Creative is still being assembled.'
  };
};

const GuideTip: React.FC<{ text: string }> = ({ text }) => (
  <details className="group relative shrink-0">
    <summary className="list-none cursor-pointer rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-bold text-gray-600 hover:bg-gray-100">
      ?
    </summary>
    <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-2 text-[11px] font-normal text-gray-600 shadow-lg">
      {text}
    </div>
  </details>
);

const FieldLabel: React.FC<{ label: string; help: string }> = ({ label, help }) => (
  <div className="mb-1 flex items-center justify-between gap-2">
    <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</span>
    <GuideTip text={help} />
  </div>
);

const normalizePlacement = (value: any): string => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'community_feed';
  if (raw === 'feed') return 'community_feed';
  if (raw === 'chat') return 'chat_sidebar';
  if (raw === 'scroll' || raw === 'scroll_video' || raw === 'scroll_overlay') return 'scroll_preroll';
  if (raw === 'forum_top') return 'forum_listing';
  return raw;
};

const normalizedPlacementsNeedCreative = (placements: string[]) =>
  (Array.isArray(placements) ? placements : []).some((placement) => normalizePlacement(placement).startsWith('scroll_'));

const normalizePricingModel = (value: any): 'CPM' | 'CPC' =>
  String(value || '').toUpperCase() === 'CPC' ? 'CPC' : 'CPM';

const getDeliveryPlacementRows = (ad: AdCampaign) => {
  const delivery = ad.delivery || null;
  const checks = Array.isArray(delivery?.placementChecks) ? delivery.placementChecks : [];
  if (checks.length > 0) {
    return checks.map((check) => ({
      placement: normalizePlacement(check.placement),
      eligible: Boolean(check.eligible),
      blockers: Array.isArray(check.blockers) ? check.blockers : []
    }));
  }

  return getCampaignPlacements(ad).map((placement) => ({
    placement: normalizePlacement(placement),
    eligible: null as boolean | null,
    blockers: [] as string[]
  }));
};

const getDeliveryTone = (delivery?: AdCampaign['delivery'] | null) => {
  if (!delivery) {
    return {
      label: 'Checking',
      container: 'border-slate-200 bg-slate-50',
      dot: 'bg-slate-400',
      text: 'text-slate-700'
    };
  }
  if (delivery.isServing) {
    return {
      label: 'Serving',
      container: 'border-emerald-200 bg-emerald-50',
      dot: 'bg-emerald-500',
      text: 'text-emerald-800'
    };
  }
  return {
    label: 'Blocked',
    container: 'border-amber-200 bg-amber-50',
    dot: 'bg-amber-500',
    text: 'text-amber-900'
  };
};

const isCampaignFlightEnded = (ad?: AdCampaign | null) => {
  if (!ad) return false;
  const status = normalizeCampaignStatus(ad.status);
  if (status === 'ended' || status === 'completed') return true;
  const blockers = Array.isArray(ad.delivery?.blockers) ? ad.delivery.blockers : [];
  if (blockers.some((reason) => String(reason || '').toLowerCase().includes('flight has ended'))) {
    return true;
  }
  const endTime = ad.endAt ? new Date(ad.endAt).getTime() : null;
  return Boolean(endTime && Number.isFinite(endTime) && endTime <= Date.now());
};

const AdDeliveryMatrix: React.FC<{ ad: AdCampaign; compact?: boolean }> = ({ ad, compact = false }) => {
  const delivery = ad.delivery || null;
  const tone = getDeliveryTone(delivery);
  const rows = getDeliveryPlacementRows(ad);
  const blockers = Array.isArray(delivery?.blockers) ? delivery.blockers : [];
  const warnings = Array.isArray(delivery?.warnings) ? delivery.warnings : [];

  return (
    <div className={`rounded-2xl border ${tone.container} ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Delivery map
          </p>
          <p className={`mt-1 text-sm font-semibold ${tone.text}`}>
            {delivery?.summary || 'Delivery diagnostics will appear after the backend refreshes this campaign.'}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          {tone.label}
        </span>
      </div>

      <div className={`mt-3 grid gap-2 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2'}`}>
        {rows.map((row) => (
          <div
            key={row.placement}
            className={`rounded-xl border px-3 py-2 text-xs ${
              row.eligible === true
                ? 'border-emerald-200 bg-white/85 text-emerald-800'
                : row.eligible === false
                  ? 'border-amber-200 bg-white/85 text-amber-900'
                  : 'border-slate-200 bg-white/85 text-slate-600'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{getPlacementLabel(row.placement)}</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
                {row.eligible === true ? 'Ready' : row.eligible === false ? 'Blocked' : 'Pending'}
              </span>
            </div>
            {row.blockers.length > 0 && !compact ? (
              <p className="mt-1 leading-5 text-slate-600">{row.blockers[0]}</p>
            ) : null}
          </div>
        ))}
      </div>

      {!compact && blockers.length > 0 ? (
        <div className="mt-3 space-y-2">
          {blockers.slice(0, 4).map((reason) => (
            <p key={reason} className="rounded-xl bg-white/80 px-3 py-2 text-xs leading-5 text-amber-900">
              {reason}
            </p>
          ))}
        </div>
      ) : null}

      {!compact && warnings.length > 0 ? (
        <p className="mt-3 text-xs leading-5 text-slate-600">{warnings.slice(0, 2).join(' ')}</p>
      ) : null}
    </div>
  );
};

type AdFormState = {
  title: string;
  body: string;
  objective: 'traffic' | 'messages';
  destinationType: 'url' | 'messages';
  destinationUrl: string;
  ctaText: string;
  placements: string[];
  pricingModel: 'CPM' | 'CPC';
  targetCountries: string[];
  targetAudience: 'users' | 'businesses' | 'all';
  dailySpend: number;
  budget: number;
  currency: string;
  durationDays: number;
  media: {
    id: string;
    url?: string;
    downloadUrl?: string;
    download_url?: string;
    path?: string;
    storageKey?: string;
    name?: string;
    mimeType?: string;
    mime_type?: string;
    type?: string;
  }[];
};

type PromotionSourceType = 'post' | 'page' | 'group' | 'listing' | null;

type PromotionSelection = {
  type: PromotionSourceType;
  entityId: string;
  entitySlug?: string;
  entityUrl: string;
  title: string;
  subtitle: string;
  bodyDraft?: string;
};

const buildEmptyForm = (currency: string): AdFormState => ({
  title: '',
  body: '',
  objective: 'traffic',
  destinationType: 'url',
  destinationUrl: '',
  ctaText: '',
  placements: ['community_feed'],
  pricingModel: 'CPM',
  targetCountries: [],
  targetAudience: 'users',
  dailySpend: 0,
  budget: 120,
  currency: currency || 'USD',
  durationDays: 7,
  media: []
});

const PENDING_AD_SUBMIT_KEY = 'scrolith:my_ads:pending_submit_after_checkout';
const BOOST_LISTING_PREFILL_KEY = 'scrolith:my_ads:boost_listing_prefill';
const CHECKOUT_STATUS_SUCCESS = 'success';
const CHECKOUT_STATUS_CANCEL = 'cancel';
const CHECKOUT_STATUS_FAILED = 'failed';

type BoostPrefillContext = {
  boostListingId?: string;
  boostListingSlug?: string;
  boostSource?: string;
  boostPostId?: string;
  boostPageId?: string;
  boostGroupId?: string;
  boostTitle?: string;
  boostBody?: string;
  boostSubtitle?: string;
  boostDestinationUrl?: string;
  boostCtaText?: string;
  boostMedia?: any[];
};

const MyAds = () => {
  const location = useLocation();
  const navigationState = (location.state as {
    boostListingId?: string;
    boostListingSlug?: string;
    boostPostId?: string;
    boostPageId?: string;
    boostGroupId?: string;
  } | null) || null;
  const { showNotification } = useNotification();
  const { availableCurrencies, currency: selectedCurrency } = useCurrency();
  const { user } = useUser();
  const handledBoostPrefillRef = useRef<string>('');
  const handledPromotionSourceRef = useRef<string>('');
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [restartDraft, setRestartDraft] = useState<{ ad: AdCampaign; durationDays: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formActionMode, setFormActionMode] = useState<'draft' | 'submit' | 'pay' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StudioStatusFilter>('all');
  const [sortMode, setSortMode] = useState<StudioSortMode>('attention');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const studioPanelRef = useRef<HTMLElement | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [form, setForm] = useState<AdFormState>(buildEmptyForm(selectedCurrency.code));
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [adGatewaySelections, setAdGatewaySelections] = useState<Record<string, string>>({});
  const [formGatewayId, setFormGatewayId] = useState('');
  const [adsConfig, setAdsConfig] = useState<any>(null);
  const [promotionSelection, setPromotionSelection] = useState<PromotionSelection | null>(null);
  const [promotionLoading, setPromotionLoading] = useState(false);

  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceAd, setPerformanceAd] = useState<AdCampaign | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<any[]>([]);

  const currencyOptions = useMemo(
    () => availableCurrencies.filter((c) => c.isActive ?? true),
    [availableCurrencies]
  );

  const placementOptions = useMemo(() => {
    const configured = Array.isArray(adsConfig?.allowedPlacements)
      ? adsConfig.allowedPlacements.map((entry: any) => normalizePlacement(entry))
      : DEFAULT_ALLOWED_PLACEMENTS;
    const configuredSet = new Set(configured);
    const selected = PLACEMENT_OPTIONS.filter((option) => configuredSet.has(option.value));
    return selected.length ? selected : PLACEMENT_OPTIONS;
  }, [adsConfig]);

  const availableTargetCountries = useMemo(() => {
    const configured = Array.isArray(adsConfig?.targetCountries)
      ? adsConfig.targetCountries
          .map((entry: any) => String(entry || '').trim())
          .filter(Boolean)
      : DEFAULT_AD_TARGET_COUNTRIES;
    const selected = Array.isArray(form.targetCountries)
      ? form.targetCountries.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [];
    return Array.from(new Set([...configured, ...selected]));
  }, [adsConfig, form.targetCountries]);

  const maxPlacements = Math.max(1, Math.min(8, Number(adsConfig?.maxPlacementsPerAd ?? 8)));
  const maxImageAssets = Math.max(1, Math.min(12, Number(adsConfig?.maxImageAssets ?? 6)));
  const maxVideoAssets = Math.max(1, Math.min(3, Number(adsConfig?.maxVideoAssets ?? 1)));
  const minBudget = Math.max(0, Number(adsConfig?.minBudget ?? 10));
  const maxBudget = Math.max(minBudget, Number(adsConfig?.maxBudget ?? 10000));

  const normalizeStatus = (status?: string) =>
    (status || '').toString().toLowerCase().replace(/-/g, '_');

  const isPaymentAlreadySatisfied = (status?: string) => {
    const normalized = normalizeStatus(status);
    return ['paid', 'submitted_for_review', 'active', 'paused'].includes(normalized);
  };

  const isPaymentSettledStatus = (status?: string) => {
    const normalized = normalizeStatus(status);
    return ['paid', 'completed', 'succeeded', 'success', 'submitted_for_review', 'active', 'already_paid'].includes(normalized);
  };

  const shouldRetrySubmitAfterPayment = (result: { success?: boolean; code?: string; message?: string } | null | undefined) => {
    if (!result || result.success !== false) return false;
    const code = String(result.code || '').trim().toUpperCase();
    if (code === 'PAYMENT_REQUIRED') return true;
    const message = String(result.message || '').toLowerCase();
    return (
      message.includes('must be paid') ||
      message.includes('payment required') ||
      message.includes('payment is still processing')
    );
  };

  const extractCheckoutUrl = (payload: any): string => {
    if (!payload || typeof payload !== 'object') return '';
    const direct =
      payload.redirect_url ||
      payload.redirectUrl ||
      payload.checkout_url ||
      payload.checkoutUrl ||
      payload.url ||
      payload?.data?.redirect_url ||
      payload?.data?.redirectUrl ||
      payload?.data?.checkout_url ||
      payload?.data?.checkoutUrl ||
      payload?.data?.url;
    return typeof direct === 'string' ? direct.trim() : '';
  };

  const rememberPendingSubmitAfterCheckout = (adId: string) => {
    try {
      sessionStorage.setItem(
        PENDING_AD_SUBMIT_KEY,
        JSON.stringify({ adId, createdAt: Date.now() })
      );
    } catch (e) {}
  };

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const submitAdWithPaymentRetry = async (
    adId: string,
    options: { maxAttempts?: number; delayMs?: number; sessionId?: string } = {}
  ) => {
    const maxAttempts = Math.max(1, options.maxAttempts ?? 8);
    const delayMs = Math.max(500, options.delayMs ?? 2500);
    const sessionId = String(options.sessionId || '').trim();
    let lastResult: { success?: boolean; code?: string; message?: string; data?: any } | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const submitResult = await AdService.submitAd(
        adId,
        sessionId
          ? {
              sessionId,
              checkoutSessionId: sessionId
            }
          : undefined
      );
      lastResult = submitResult;
      if (submitResult?.success !== false) {
        return submitResult;
      }
      if (!shouldRetrySubmitAfterPayment(submitResult)) {
        return submitResult;
      }
      if (attempt < maxAttempts) {
        await wait(delayMs);
      }
    }

    return lastResult;
  };

  const submitAdWithAutoPayment = async (
    adId: string,
    options: { gatewayId?: string; currency?: string } = {}
  ): Promise<{ submitted: boolean; redirected: boolean; message?: string; code?: string }> => {
    // Payment is the publishing gate: paid campaigns are automatically submitted or activated.
    const paymentState = await requestAdPayment(adId, {
      gatewayId: options.gatewayId,
      currency: options.currency || form.currency,
      pendingSubmit: true
    });

    if (paymentState.redirected) {
      return { submitted: false, redirected: true };
    }

    if (!paymentState.paid) {
      return {
        submitted: false,
        redirected: false,
        message: paymentState.message || 'Payment could not be completed. Please retry checkout.',
        code: paymentState.code
      };
    }

    const submitAfterPayment = await submitAdWithPaymentRetry(adId);
    if (shouldRetrySubmitAfterPayment(submitAfterPayment)) {
      const recheckPayment = await requestAdPayment(adId, {
        gatewayId: options.gatewayId,
        currency: options.currency || form.currency,
        pendingSubmit: true
      });
      if (recheckPayment.redirected) {
        return { submitted: false, redirected: true, code: recheckPayment.code };
      }
      if (recheckPayment.paid) {
        const retrySubmit = await submitAdWithPaymentRetry(adId);
        if (retrySubmit?.success !== false) {
          return { submitted: true, redirected: false, message: retrySubmit?.message, code: retrySubmit?.code };
        }
        return {
          submitted: false,
          redirected: false,
          message: retrySubmit?.message || 'Unable to submit ad after payment.',
          code: retrySubmit?.code
        };
      }
      return {
        submitted: false,
        redirected: false,
        message: recheckPayment.message || 'Payment could not be completed. Please retry checkout.',
        code: recheckPayment.code
      };
    }
    if (submitAfterPayment?.success === false) {
      return {
        submitted: false,
        redirected: false,
        message: submitAfterPayment?.message || 'Unable to submit ad after payment.',
        code: submitAfterPayment?.code
      };
    }

    return {
      submitted: true,
      redirected: false,
      message: submitAfterPayment?.message,
      code: submitAfterPayment?.code
    };
  };

  const consumePendingSubmitAfterCheckout = (adId: string): boolean => {
    try {
      const raw = sessionStorage.getItem(PENDING_AD_SUBMIT_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw || '{}');
      sessionStorage.removeItem(PENDING_AD_SUBMIT_KEY);
      return String(parsed?.adId || '') === adId;
    } catch (e) {
      return false;
    }
  };

  const clearCheckoutQuery = () => {
    try {
      const params = new URLSearchParams(location.search);
      const keys = ['ad_payment', 'ad_payment_status', 'ad_id', 'adId', 'session_id'];
      let changed = false;
      keys.forEach((key) => {
        if (params.has(key)) {
          params.delete(key);
          changed = true;
        }
      });
      if (!changed) return;
      const next = `${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', next);
    } catch (e) {}
  };

  const clearPromotionSourceQuery = () => {
    try {
      const params = new URLSearchParams(location.search);
      const keys = ['source', 'postId', 'pageId', 'pageSlug', 'groupId', 'clubId', 'groupSlug', 'boostOpen'];
      let changed = false;
      keys.forEach((key) => {
        if (params.has(key)) {
          params.delete(key);
          changed = true;
        }
      });
      if (!changed) return;
      const next = `${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', next);
    } catch (e) {}
  };

  const clearBoostListingQuery = () => {
    try {
      const params = new URLSearchParams(location.search);
      const keys = ['boostListingId', 'boostPostId', 'boostPageId', 'boostGroupId', 'boostOpen'];
      let changed = false;
      keys.forEach((key) => {
        if (params.has(key)) {
          params.delete(key);
          changed = true;
        }
      });
      if (!changed) return;
      const next = `${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', next);
    } catch (e) {}
  };

  const readBoostListingPrefillContext = (): BoostPrefillContext | null => {
    try {
      const raw = sessionStorage.getItem(BOOST_LISTING_PREFILL_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const boostListingId = String(parsed?.boostListingId || '').trim();
      const boostPostId = String(parsed?.boostPostId || '').trim();
      const boostPageId = String(parsed?.boostPageId || '').trim();
      const boostGroupId = String(parsed?.boostGroupId || '').trim();
      if (!boostListingId && !boostPostId && !boostPageId && !boostGroupId) return null;
      return {
        boostListingId,
        boostListingSlug: String(parsed?.boostListingSlug || '').trim(),
        boostSource: String(parsed?.boostSource || '').trim(),
        boostPostId,
        boostPageId,
        boostGroupId,
        boostTitle: String(parsed?.boostTitle || '').trim(),
        boostBody: String(parsed?.boostBody || '').trim(),
        boostSubtitle: String(parsed?.boostSubtitle || '').trim(),
        boostDestinationUrl: String(parsed?.boostDestinationUrl || '').trim(),
        boostCtaText: String(parsed?.boostCtaText || '').trim(),
        boostMedia: Array.isArray(parsed?.boostMedia) ? parsed.boostMedia : []
      };
    } catch (error) {
      return null;
    }
  };

  const clearBoostListingPrefillContext = () => {
    try {
      sessionStorage.removeItem(BOOST_LISTING_PREFILL_KEY);
    } catch (error) {}
  };

  const resolveGatewayProvider = (gatewayId?: string, sourceGateway?: any): string => {
    const rawId = String(gatewayId || '').trim();
    if (!rawId) return '';
    const selectedGateway =
      sourceGateway ||
      paymentGateways.find((gateway: any) => String(gateway?.id || '').trim() === rawId) ||
      null;
    const candidates = [
      rawId,
      selectedGateway?.id,
      (selectedGateway as any)?.provider,
      (selectedGateway as any)?.providerId,
      (selectedGateway as any)?.provider_id,
      (selectedGateway as any)?.method,
      (selectedGateway as any)?.type,
      (selectedGateway as any)?.code,
      (selectedGateway as any)?.gatewayId,
      (selectedGateway as any)?.gateway_id,
      getUserFacingPaymentMethodName(selectedGateway as any),
      selectedGateway?.name,
      (selectedGateway as any)?.label
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);

    if (candidates.some((value) => value === 'wallet' || value === 'balance' || value.includes('wallet'))) {
      return 'wallet';
    }
    if (candidates.some((value) => value === 'card' || value.includes('stripe'))) {
      return 'stripe';
    }
    return candidates[0] || '';
  };

  const getStripeGatewayId = () => {
    const externalGateway = paymentGateways.find(
      (gateway: any) => resolveGatewayProvider(String(gateway?.id || ''), gateway) === 'stripe'
    );
    return String(externalGateway?.id || '');
  };

  const getWalletGatewayId = () => {
    const walletGateway = paymentGateways.find(
      (gateway: any) => resolveGatewayProvider(String(gateway?.id || ''), gateway) === 'wallet'
    );
    return String(walletGateway?.id || 'wallet');
  };

  const normalizeGatewaySelection = (candidate?: string) => {
    const raw = String(candidate || '').trim();
    if (!raw) return '';

    const direct = paymentGateways.find((gateway: any) => String(gateway?.id || '').trim() === raw);
    if (direct) return String(direct.id || '');

    const provider = resolveGatewayProvider(raw);
    if (provider === 'wallet') return getWalletGatewayId();
    if (provider === 'stripe') return getStripeGatewayId();
    return '';
  };

  const getPreferredCheckoutGatewayId = () => {
    const stripeGatewayId = getStripeGatewayId();
    if (stripeGatewayId) return stripeGatewayId;
    return getWalletGatewayId();
  };

  const resolveGatewaySelection = (
    adId?: string,
    fallback?: string,
    options: { preferFallback?: boolean } = {}
  ) => {
    const candidates: string[] = [];
    if (options.preferFallback && fallback) candidates.push(fallback);
    if (adId && adGatewaySelections[adId]) candidates.push(adGatewaySelections[adId]);
    if (formGatewayId) candidates.push(formGatewayId);
    if (!options.preferFallback && fallback) candidates.push(fallback);
    candidates.push(getPreferredCheckoutGatewayId());

    for (const candidate of candidates) {
      const normalized = normalizeGatewaySelection(candidate);
      if (normalized) return normalized;
    }
    return '';
  };

  const shouldFallbackWalletToStripe = (result: { message?: string; code?: string } | null | undefined): boolean => {
    const code = String(result?.code || '').trim().toUpperCase();
    if (code === 'PAYMENT_METHOD_UNSUPPORTED') return true;
    const message = String(result?.message || '').toLowerCase();
    return (
      message.includes('insufficient wallet') ||
      message.includes('wallet currency') ||
      message.includes('wallet is frozen') ||
      message.includes('choose stripe') ||
      message.includes('not available for direct ad checkout')
    );
  };

  const requestAdPayment = async (
    adId: string,
    options: { gatewayId?: string; currency?: string; pendingSubmit?: boolean } = {}
  ): Promise<{ redirected: boolean; paid: boolean; message?: string; code?: string }> => {
    let gatewayId =
      normalizeGatewaySelection(options.gatewayId || '') || getPreferredCheckoutGatewayId();
    const currency = options.currency || form.currency || 'USD';
    const pendingSubmit = Boolean(options.pendingSubmit);
    let selectedGateway = paymentGateways.find(
      (gateway: any) => String(gateway?.id || '').trim() === String(gatewayId || '').trim()
    );
    let providerId = resolveGatewayProvider(gatewayId, selectedGateway);
    const stripeGatewayId = getStripeGatewayId();

    if ((!providerId || !['wallet', 'stripe'].includes(providerId)) && stripeGatewayId) {
      gatewayId = stripeGatewayId;
      selectedGateway = paymentGateways.find(
        (gateway: any) => String(gateway?.id || '').trim() === String(gatewayId || '').trim()
      );
      providerId = resolveGatewayProvider(gatewayId, selectedGateway);
    }

    // Final guardrail: if gateway metadata is inconsistent, default to Stripe checkout path.
    if (!providerId || !['wallet', 'stripe'].includes(providerId)) {
      providerId = 'stripe';
    }
    if (!gatewayId) {
      gatewayId = providerId === 'wallet' ? getWalletGatewayId() : stripeGatewayId || 'stripe';
    }
    if (!providerId || !['wallet', 'stripe'].includes(providerId)) {
      showNotification('warning', 'Payment method', 'No supported payment method is currently available.');
      return {
        redirected: false,
        paid: false,
        message: 'No supported payment method is currently available.',
        code: 'PAYMENT_METHOD_UNSUPPORTED'
      };
    }

    const paymentResult = await AdService.payAd(adId, {
      paymentMethodId: providerId,
      gatewayId,
      currency
    });
    const paymentCode = String(paymentResult?.code || '').trim().toUpperCase() || undefined;
    if (paymentResult?.success === false) {
      if (
        providerId === 'wallet' &&
        shouldFallbackWalletToStripe(paymentResult) &&
        stripeGatewayId &&
        String(stripeGatewayId) !== String(gatewayId)
      ) {
        showNotification('info', 'Wallet fallback', 'Opening Stripe checkout to complete payment.');
        return requestAdPayment(adId, {
          ...options,
          gatewayId: stripeGatewayId
        });
      }
      showNotification('error', 'Payment failed', paymentResult?.message || 'Unable to process payment.');
      return {
        redirected: false,
        paid: false,
        message: paymentResult?.message || 'Unable to process payment.',
        code: paymentCode
      };
    }

    const paymentPayload = paymentResult?.data || paymentResult;
    const checkoutUrl = extractCheckoutUrl(paymentPayload);
    if (checkoutUrl) {
      if (pendingSubmit) rememberPendingSubmitAfterCheckout(adId);
      showNotification('info', 'Redirecting', 'Opening checkout to complete payment.');
      window.location.assign(checkoutUrl);
      return { redirected: true, paid: false, message: 'Opening checkout.', code: paymentCode };
    }

    const paymentStatus =
      String(paymentPayload?.status || paymentResult?.status || '').trim() ||
      String(paymentPayload?.paymentStatus || '').trim();
    if (isPaymentSettledStatus(paymentStatus)) {
      showNotification('success', 'Paid', paymentResult?.message || 'Payment completed successfully.');
      return {
        redirected: false,
        paid: true,
        message: paymentResult?.message || 'Payment completed successfully.',
        code: paymentCode
      };
    }

    showNotification(
      'error',
      'Payment pending',
      paymentResult?.message || 'Could not open checkout for the selected payment method. Please try again.'
    );
    return {
      redirected: false,
      paid: false,
      message: paymentResult?.message || 'Could not open checkout for the selected payment method.',
      code: paymentCode
    };
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await AdService.getMyAds();
      setAds(Array.isArray(data) ? data : []);
    } catch (e: any) {
      showNotification('error', 'Load failed', e?.message || 'Unable to load your ads.');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hasBoostParams =
      Boolean(
        params.get('boostListingId') ||
          params.get('boostPostId') ||
          params.get('boostPageId') ||
          params.get('boostGroupId') ||
          navigationState?.boostListingId ||
          navigationState?.boostPostId ||
          navigationState?.boostPageId ||
          navigationState?.boostGroupId
      ) ||
      Boolean(readBoostListingPrefillContext()?.boostListingId || readBoostListingPrefillContext()?.boostPostId || readBoostListingPrefillContext()?.boostPageId || readBoostListingPrefillContext()?.boostGroupId);
    if (hasBoostParams) return;
    const paymentState = String(
      params.get('ad_payment') || params.get('ad_payment_status') || ''
    ).toLowerCase();
    const adId = String(params.get('ad_id') || params.get('adId') || '').trim();
    const sessionId = String(params.get('session_id') || '').trim();
    if (!paymentState) return;

    const run = async () => {
      if (paymentState === CHECKOUT_STATUS_CANCEL || paymentState === CHECKOUT_STATUS_FAILED) {
        showNotification('warning', 'Payment not completed', 'Checkout was cancelled. You can retry payment from My Ads.');
        await load();
        clearCheckoutQuery();
        return;
      }

      if (paymentState === CHECKOUT_STATUS_SUCCESS) {
        let submittedAfterPayment = false;
        if (adId && consumePendingSubmitAfterCheckout(adId)) {
          const submitResult = await submitAdWithPaymentRetry(adId, {
            maxAttempts: 10,
            delayMs: 2500,
            sessionId
          });
          if (submitResult?.success === false) {
            showNotification('warning', 'Paid, not submitted', submitResult?.message || 'Payment succeeded but auto-submit could not complete.');
          } else {
            submittedAfterPayment = true;
            showNotification('success', 'Submitted', 'Payment completed and campaign submitted for review.');
          }
        }
        if (!submittedAfterPayment) {
          showNotification('success', 'Payment completed', 'Your ad payment is complete.');
        }
        await load();
        clearCheckoutQuery();
      }
    };

    run();
  }, [location.search, load, showNotification]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const boostContext = readBoostListingPrefillContext();
    const hasBoostParams = Boolean(
      params.get('boostListingId') ||
        params.get('boostPostId') ||
        params.get('boostPageId') ||
        params.get('boostGroupId') ||
        navigationState?.boostListingId ||
        navigationState?.boostPostId ||
        navigationState?.boostPageId ||
        navigationState?.boostGroupId ||
        boostContext?.boostListingId ||
        boostContext?.boostPostId ||
        boostContext?.boostPageId ||
        boostContext?.boostGroupId
    );
    if (!hasBoostParams) {
      handledBoostPrefillRef.current = '';
    }
  }, [
    location.search,
    navigationState?.boostListingId,
    navigationState?.boostPostId,
    navigationState?.boostPageId,
    navigationState?.boostGroupId
  ]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sourceRaw = String(params.get('source') || '').trim().toLowerCase();
    if (!sourceRaw) return;
    if (
      params.get('boostListingId') ||
      params.get('boostPostId') ||
      params.get('boostPageId') ||
      params.get('boostGroupId')
    ) {
      return;
    }

    const source: PromotionSourceType =
      sourceRaw === 'post'
        ? 'post'
        : sourceRaw === 'business-page' || sourceRaw === 'page'
          ? 'page'
          : sourceRaw === 'group' || sourceRaw === 'club' || sourceRaw === 'community-group'
            ? 'group'
          : sourceRaw === 'listing' || sourceRaw === 'marketplace-listing'
            ? 'listing'
            : null;
    if (!source) return;

    let cancelled = false;

    const applyPromotionSelection = async () => {
      setPromotionLoading(true);
      try {
        if (source === 'post') {
          const postId = String(params.get('postId') || '').trim();
          if (!postId) throw new Error('Post details are missing.');
          const post = await CommunityService.getPostById(postId);
          const resolvedId = String(post?.id || postId).trim();
          if (!resolvedId) throw new Error('Post details are not available.');
          const selection: PromotionSelection = {
            type: 'post',
            entityId: resolvedId,
            entityUrl: `${window.location.origin}/community/posts/${encodeURIComponent(resolvedId)}`,
            title: String(post?.title || '').trim() || 'Promoted Post',
            subtitle:
              String(post?.businessPage?.name || post?.author?.name || '').trim() || 'Community Post',
            bodyDraft: String(post?.content || '').trim()
          };

          if (cancelled) return;
          setPromotionSelection(selection);
          setFormMode('create');
          setEditingAdId(null);
          setForm({
            ...buildEmptyForm(selectedCurrency.code),
            title: selection.title,
            body: selection.bodyDraft || '',
            objective: 'traffic',
            destinationType: 'url',
            destinationUrl: selection.entityUrl,
            ctaText: 'Learn more'
          });
          setFormGatewayId(getPreferredCheckoutGatewayId());
          setFormOpen(true);
          handledPromotionSourceRef.current = `post:${resolvedId}`;
          return;
        }

        if (source === 'group') {
          const groupRef = String(params.get('groupId') || params.get('clubId') || params.get('groupSlug') || '').trim();
          if (!groupRef) throw new Error('Group details are missing.');
          const group = await CommunityService.getGroup(groupRef);
          const resolvedGroupId = String(group?.id || groupRef).trim();
          if (!resolvedGroupId) throw new Error('Group details are not available.');
          const resolvedGroupSlug = String(group?.slug || groupRef).trim();
          const selection: PromotionSelection = {
            type: 'group',
            entityId: resolvedGroupId,
            entitySlug: resolvedGroupSlug,
            entityUrl: `${window.location.origin}/community/clubs?group=${encodeURIComponent(resolvedGroupSlug || resolvedGroupId)}`,
            title: String(group?.name || '').trim() || 'Promoted Group',
            subtitle: String(group?.summary || group?.category || '').trim() || 'Community Group',
            bodyDraft: String(group?.description || '').trim()
          };

          if (cancelled) return;
          setPromotionSelection(selection);
          setFormMode('create');
          setEditingAdId(null);
          setForm({
            ...buildEmptyForm(selectedCurrency.code),
            title: selection.title,
            body: selection.bodyDraft || '',
            objective: 'traffic',
            destinationType: 'url',
            destinationUrl: selection.entityUrl,
            ctaText: 'Join group'
          });
          setFormGatewayId(getPreferredCheckoutGatewayId());
          setFormOpen(true);
          handledPromotionSourceRef.current = `group:${resolvedGroupId}`;
          return;
        }

        const rawPageSlug = String(params.get('pageSlug') || '').trim();
        const rawPageId = String(params.get('pageId') || '').trim();
        let page: any = null;
        if (rawPageSlug) {
          page = await CommunityService.getBusinessPageBySlug(rawPageSlug);
        } else if (rawPageId) {
          const pages = await CommunityService.getMyBusinessPages();
          page = (Array.isArray(pages) ? pages : []).find((entry: any) => String(entry?.id || '') === rawPageId) || null;
        }

        if (!page) throw new Error('Page details are not available.');
        const resolvedPageId = String(page?.id || rawPageId || '').trim();
        const resolvedPageSlug = String(page?.slug || rawPageSlug || '').trim();
        if (!resolvedPageId || !resolvedPageSlug) {
          throw new Error('Page details are incomplete.');
        }
        const selection: PromotionSelection = {
          type: 'page',
          entityId: resolvedPageId,
          entitySlug: resolvedPageSlug,
          entityUrl: `${window.location.origin}/company/${encodeURIComponent(resolvedPageSlug)}`,
          title: String(page?.name || '').trim() || 'Promoted Page',
          subtitle: String(page?.tagline || page?.category || '').trim() || 'Business Page',
          bodyDraft: String(page?.description || '').trim()
        };

        if (cancelled) return;
        setPromotionSelection(selection);
        setFormMode('create');
        setEditingAdId(null);
        setForm({
          ...buildEmptyForm(selectedCurrency.code),
          title: selection.title,
          body: selection.bodyDraft || '',
          objective: 'traffic',
          destinationType: 'url',
          destinationUrl: selection.entityUrl,
          ctaText: 'Visit page'
        });
        setFormGatewayId(getPreferredCheckoutGatewayId());
        setFormOpen(true);
        handledPromotionSourceRef.current = `page:${resolvedPageId}`;
      } catch (error: any) {
        if (!cancelled) {
          showNotification('error', 'Promote', error?.message || 'Unable to prepare promotion campaign.');
        }
      } finally {
        if (!cancelled) {
          setPromotionLoading(false);
        }
      }
    };

    applyPromotionSelection();
    return () => {
      cancelled = true;
    };
  }, [location.search, selectedCurrency.code, showNotification]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const boostContext = readBoostListingPrefillContext();
    const boostListingId = String(params.get('boostListingId') || navigationState?.boostListingId || boostContext?.boostListingId || '').trim();
    const boostPostId = String(params.get('boostPostId') || navigationState?.boostPostId || boostContext?.boostPostId || '').trim();
    const boostPageId = String(params.get('boostPageId') || navigationState?.boostPageId || boostContext?.boostPageId || '').trim();
    const boostGroupId = String(params.get('boostGroupId') || navigationState?.boostGroupId || boostContext?.boostGroupId || '').trim();
    const boostKey = boostListingId || boostPostId || boostPageId || boostGroupId;
    if (!boostKey) return;
    if (handledBoostPrefillRef.current === boostKey) return;

    let cancelled = false;

    const applyBoostPrefill = async () => {
      const boostType: PromotionSourceType = boostListingId
        ? 'listing'
        : boostPostId
          ? 'post'
          : boostPageId
            ? 'page'
            : boostGroupId
              ? 'group'
              : null;
      const fallbackTitle = String(boostContext?.boostTitle || '').trim();
      const fallbackBody = String(boostContext?.boostBody || '').trim();
      const fallbackSubtitle = String(boostContext?.boostSubtitle || '').trim();
      const fallbackDestinationUrl = String(boostContext?.boostDestinationUrl || '').trim();
      const fallbackCtaText = String(boostContext?.boostCtaText || '').trim();
      const fallbackMedia = Array.isArray(boostContext?.boostMedia)
        ? boostContext.boostMedia
            .map((media: any) => {
              const normalizedMedia = normalizeAdMediaAttachment(media);
              const resolvedMediaUrl = resolveAdPreviewMediaUrl(normalizedMedia);
              const resolvedPosterUrl = resolveAdPreviewPosterUrl(normalizedMedia);
              const fileId = String(media?.fileId || media?.file_id || '').trim();
              const mediaId = fileId || String(media?.id || resolvedMediaUrl || '').trim();
              return {
                id: mediaId,
                fileId: fileId || mediaId,
                file_id: fileId || mediaId,
                url: resolvedMediaUrl,
                thumbnailUrl: resolvedPosterUrl,
                thumbnail_url: resolvedPosterUrl,
                imageUrl: resolvedMediaUrl,
                image_url: resolvedMediaUrl,
                downloadUrl: resolvedMediaUrl,
                download_url: resolvedMediaUrl,
                previewUrl: resolvedPosterUrl || resolvedMediaUrl,
                preview_url: resolvedPosterUrl || resolvedMediaUrl,
                path: resolvedMediaUrl,
                name: media?.name,
                mimeType: media?.mimeType,
                mime_type: media?.mime_type,
                type: media?.type
              };
            })
            .filter((media: any) => Boolean(media.id) && Boolean(media.url))
        : [];

      const applyContextFallback = () => {
        if (!boostType) return false;
        const fallbackEntityId = boostListingId || boostPostId || boostPageId || boostGroupId;
        const fallbackEntityUrl = fallbackDestinationUrl || `${window.location.origin}/freelancer/dashboard?tab=my-ads`;
        const fallbackResolvedTitle = fallbackTitle || 'Promoted Content';
        const fallbackResolvedSubtitle =
          fallbackSubtitle ||
          (boostType === 'listing'
            ? 'Marketplace Listing'
            : boostType === 'page'
              ? 'Business Page'
              : boostType === 'group'
                ? 'Community Group'
                : 'Community Post');
        if (!fallbackEntityId && !fallbackResolvedTitle && !fallbackBody && fallbackMedia.length === 0) return false;
        setPromotionSelection({
          type: boostType,
          entityId: fallbackEntityId,
          entitySlug: String(boostContext?.boostListingSlug || '').trim() || undefined,
          entityUrl: fallbackEntityUrl,
          title: fallbackResolvedTitle,
          subtitle: fallbackResolvedSubtitle,
          bodyDraft: fallbackBody
        });
        setForm({
          ...buildEmptyForm(selectedCurrency.code),
          title: fallbackResolvedTitle,
          body: fallbackBody,
          objective: 'traffic',
          destinationType: 'url',
          destinationUrl: fallbackEntityUrl,
          ctaText:
            fallbackCtaText ||
            (boostType === 'listing'
              ? 'View Listing'
              : boostType === 'page'
                ? 'Visit page'
                : boostType === 'group'
                  ? 'Join group'
                  : 'Learn more'),
          placements: ['community_feed'],
          media: fallbackMedia
        });
        setFormGatewayId(getPreferredCheckoutGatewayId());
        setFormOpen(true);
        handledBoostPrefillRef.current = boostKey;
        return true;
      };

      setPromotionLoading(true);
      setFormMode('create');
      setEditingAdId(null);
      setFormOpen(true);
      try {
        const boost = boostListingId
          ? await AdService.getListingBoostPrefill(boostListingId)
          : boostPostId
            ? await AdService.getPostBoostPrefill(boostPostId)
            : boostPageId
              ? await AdService.getPageBoostPrefill(boostPageId)
              : await AdService.getGroupBoostPrefill(boostGroupId);
        if (cancelled) return;

        const boostMedia = Array.isArray(boost.media)
          ? boost.media
              .map((media: any) => {
                const normalizedMedia = normalizeAdMediaAttachment(media);
                const resolvedMediaUrl = resolveAdPreviewMediaUrl(normalizedMedia);
                const resolvedPosterUrl = resolveAdPreviewPosterUrl(normalizedMedia);
                const fileId = String(media?.fileId || media?.file_id || '').trim();
                const mediaId = fileId || String(media?.id || resolvedMediaUrl || '').trim();
                return {
                  id: mediaId,
                  fileId: fileId || mediaId,
                  file_id: fileId || mediaId,
                  url: resolvedMediaUrl,
                  thumbnailUrl: resolvedPosterUrl,
                  thumbnail_url: resolvedPosterUrl,
                  imageUrl: resolvedMediaUrl,
                  image_url: resolvedMediaUrl,
                  downloadUrl: resolvedMediaUrl,
                  download_url: resolvedMediaUrl,
                  previewUrl: resolvedPosterUrl || resolvedMediaUrl,
                  preview_url: resolvedPosterUrl || resolvedMediaUrl,
                  storagePath: String(media?.storagePath || media?.storage_path || '').trim(),
                  storage_key: String(media?.storage_key || media?.storagePath || '').trim(),
                  path: resolvedMediaUrl,
                  storageKey: String(media?.storageKey || media?.storagePath || '').trim(),
                  name: media?.name,
                  mimeType: media?.mimeType,
                  mime_type: media?.mime_type,
                  type: media?.type
                };
              })
              .filter((media: any) => Boolean(media.id) && Boolean(media.url))
          : [];
        const effectiveMedia = boostMedia.length > 0 ? boostMedia : fallbackMedia;
        const effectiveEntityUrl = String(boost.destinationUrl || boost.sourceUrl || boost.listingUrl || fallbackDestinationUrl || '').trim();
        const effectiveTitle = String(boost.campaignName || boost.adTitle || fallbackTitle || '').trim();
        const effectiveBody = String(boost.adCopy || fallbackBody || '').trim();
        const effectiveSubtitle =
          boost.sourceType === 'COMMUNITY_POST'
            ? fallbackSubtitle || 'Community Post'
            : boost.sourceType === 'BUSINESS_PAGE'
              ? fallbackSubtitle || 'Business Page'
              : boost.sourceType === 'COMMUNITY_GROUP'
                ? fallbackSubtitle || 'Community Group'
                : fallbackSubtitle || 'Marketplace Listing';

        setPromotionSelection({
          type:
            boost.sourceType === 'COMMUNITY_POST'
              ? 'post'
              : boost.sourceType === 'BUSINESS_PAGE'
                ? 'page'
                : boost.sourceType === 'COMMUNITY_GROUP'
                  ? 'group'
                  : 'listing',
          entityId: String(boost.sourceId || boost.listingId || boostListingId || boostPostId || boostPageId || boostGroupId || '').trim(),
          entitySlug: String(boost.sourceSlug || boost.listingSlug || boostContext?.boostListingSlug || '').trim() || undefined,
          entityUrl: effectiveEntityUrl,
          title: effectiveTitle || `Boost - ${String(boost.adTitle || fallbackTitle || 'Promotion').trim()}`,
          subtitle: effectiveSubtitle,
          bodyDraft: effectiveBody
        });
        setFormMode('create');
        setEditingAdId(null);
        setForm({
          ...buildEmptyForm(boost.currency || selectedCurrency.code),
          title: effectiveTitle,
          body: effectiveBody,
          objective: boost.objective || 'traffic',
          destinationType: boost.destinationType || 'url',
          destinationUrl: effectiveEntityUrl,
          ctaText: boost.ctaText || fallbackCtaText || 'View Listing',
          placements: Array.isArray(boost.placements) && boost.placements.length > 0 ? boost.placements.map((placement) => normalizePlacement(placement)) : ['community_feed'],
          pricingModel: 'CPM',
          targetCountries: Array.isArray(boost.targetCountries) ? boost.targetCountries : [],
          targetAudience: boost.targetAudience || 'users',
          dailySpend: Number(boost.dailySpend || 0),
          budget: Number(boost.budget || 120),
          currency: boost.currency || selectedCurrency.code || 'USD',
          durationDays: Number(boost.durationDays || 7),
          media: effectiveMedia
        });
        setFormGatewayId(getPreferredCheckoutGatewayId());
        setFormOpen(true);
        handledBoostPrefillRef.current = boostKey;
      } catch (error: any) {
        if (!cancelled) {
          const usedContextFallback = applyContextFallback();
          if (!usedContextFallback) {
            showNotification('error', 'Boost promotion', error?.message || 'Unable to prepare boost campaign.');
            setFormOpen(false);
          }
        }
      } finally {
        if (!cancelled) {
          setPromotionLoading(false);
        }
      }
    };

    applyBoostPrefill();
    return () => {
      cancelled = true;
    };
  }, [
    location.search,
    navigationState?.boostListingId,
    navigationState?.boostPostId,
    navigationState?.boostPageId,
    navigationState?.boostGroupId,
    selectedCurrency.code,
    showNotification
  ]);

  useEffect(() => {
    if (promotionLoading || formOpen) return;

    if (handledPromotionSourceRef.current) {
      clearPromotionSourceQuery();
      handledPromotionSourceRef.current = '';
    }

    if (handledBoostPrefillRef.current) {
      clearBoostListingPrefillContext();
      clearBoostListingQuery();
      handledBoostPrefillRef.current = '';
    }
  }, [formOpen, promotionLoading, location.search]);

  useEffect(() => {
    const loadGateways = async () => {
      setGatewayLoading(true);
      try {
        const gateways = await PaymentService.getActivePaymentMethods();
        const active = Array.isArray(gateways) ? gateways : [];
        const supported = active.filter(
          (gateway: any) => resolveGatewayProvider(String(gateway?.id || ''), gateway) === 'stripe'
        );
        const dedupedSupported = Array.from(
          new Map(
            supported.map((gateway: any) => [String(gateway?.id || '').trim().toLowerCase(), gateway])
          ).values()
        );
        const walletGateway = {
          id: 'wallet',
          name: 'Wallet Balance',
          is_enabled: true,
          isEnabled: true,
          supported_currencies: [],
          supportedCurrencies: []
        } as PaymentGateway;
        setPaymentGateways([walletGateway, ...dedupedSupported]);
      } catch (e: any) {
        setPaymentGateways([
          {
            id: 'wallet',
            name: 'Wallet Balance',
            is_enabled: true,
            isEnabled: true,
            supported_currencies: [],
            supportedCurrencies: []
          } as PaymentGateway
        ]);
      } finally {
        setGatewayLoading(false);
      }
    };
    loadGateways();
  }, []);

  useEffect(() => {
    const loadAdsConfig = async () => {
      try {
        const config = await AdService.getConfig();
        setAdsConfig(config || null);
      } catch (e) {
        setAdsConfig(null);
      }
    };
    loadAdsConfig();
  }, []);

  useEffect(() => {
    if (paymentGateways.length === 0) {
      setAdGatewaySelections({});
      return;
    }
    setAdGatewaySelections((prev) => {
      const next: Record<string, string> = {};
      const preferredGatewayId = getPreferredCheckoutGatewayId();
      ads.forEach((ad) => {
        next[ad.id] = prev[ad.id] || preferredGatewayId;
      });
      return next;
    });
  }, [ads, paymentGateways]);

  useEffect(() => {
    if (!formOpen) return;
    if (paymentGateways.length === 0) {
      setFormGatewayId('');
      return;
    }
    setFormGatewayId((prev) => {
      if (prev && paymentGateways.some((gateway) => gateway.id === prev)) return prev;
      return getPreferredCheckoutGatewayId();
    });
  }, [formOpen, paymentGateways]);

  useEffect(() => {
    const handleAdEvents = () => {
      load();
      if (performanceOpen && performanceAd?.id) {
        refreshPerformance(performanceAd.id);
      }
    };
    const events = [
      'community:ad_status_updated',
      'community:ad_created',
      'community:ad_deleted',
      'community:ad_metrics_updated'
    ];
    events.forEach((ev) => window.addEventListener(ev, handleAdEvents as EventListener));
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleAdEvents as EventListener));
    };
  }, [load, performanceOpen, performanceAd?.id]);

  useEffect(() => {
    if (!formOpen) return;
    if (!form.currency) {
      setForm((prev) => ({ ...prev, currency: selectedCurrency.code || 'USD' }));
    }
  }, [formOpen, form.currency, selectedCurrency.code]);

  const getPlacementRate = useCallback(
    (placement: string, kind: 'cpmByPlacement' | 'cpcByPlacement') => {
      const normalized = normalizePlacement(placement);
      const source = (adsConfig?.[kind] || {}) as Record<string, any>;
      const aliases = [normalized];
      if (normalized === 'community_feed') aliases.push('feed');
      if (normalized === 'chat_sidebar') aliases.push('chat');
      for (const key of aliases) {
        const value = Number(source[key]);
        if (Number.isFinite(value) && value >= 0) return value;
      }
      return 0;
    },
    [adsConfig]
  );

  const primaryPlacement = form.placements[0] || placementOptions[0]?.value || 'community_feed';
  const activeRates = useMemo(() => {
    return {
      cpm: getPlacementRate(primaryPlacement, 'cpmByPlacement'),
      cpc: getPlacementRate(primaryPlacement, 'cpcByPlacement')
    };
  }, [getPlacementRate, primaryPlacement]);

  const estimatedOutcomes = useMemo(() => {
    const budget = toNumber(form.budget);
    if (form.pricingModel === 'CPM') {
      return {
        impressions: activeRates.cpm > 0 ? Math.floor((budget / activeRates.cpm) * 1000) : 0,
        clicks: 0
      };
    }
    return {
      impressions: 0,
      clicks: activeRates.cpc > 0 ? Math.floor(budget / activeRates.cpc) : 0
    };
  }, [form.budget, form.pricingModel, activeRates.cpm, activeRates.cpc]);

  const mediaCounts = useMemo(() => {
    return form.media.reduce(
      (acc, media) => {
        if (isAdVideoMedia(media)) acc.videos += 1;
        else acc.images += 1;
        return acc;
      },
      { images: 0, videos: 0 }
    );
  }, [form.media]);

  const buildPromotionSelectionFromAd = useCallback((ad: AdCampaign): PromotionSelection | null => {
    const targeting = getCampaignTargeting(ad);
    const promotionType = String(targeting.promotionType || '').trim().toLowerCase();
    const sourceType = String(targeting.sourceType || '').trim().toLowerCase();

    if (promotionType === 'listing' || sourceType === 'marketplace_listing') {
      const entityId = String(targeting.promotionEntityId || targeting.sourceId || '').trim();
      if (!entityId) return null;
      const entitySlug = String(targeting.promotionEntitySlug || targeting.sourceSlug || '').trim();
      const entityUrl =
        String(targeting.promotionEntityUrl || targeting.sourceUrl || '').trim() ||
        `${window.location.origin}/marketplace/listing/${encodeURIComponent(entitySlug || entityId)}`;
      return {
        type: 'listing',
        entityId,
        entitySlug: entitySlug || undefined,
        entityUrl,
        title: String(targeting.promotionTitle || ad.title || 'Boosted Listing').trim(),
        subtitle: String(targeting.promotionSubtitle || 'Marketplace Listing').trim(),
        bodyDraft: String(ad.body || targeting.sourceBody || '').trim()
      };
    }

    if (promotionType === 'post') {
      const entityId = String(targeting.promotionEntityId || '').trim();
      if (!entityId) return null;
      return {
        type: 'post',
        entityId,
        entityUrl:
          String(targeting.promotionEntityUrl || '').trim() ||
          `${window.location.origin}/community/posts/${encodeURIComponent(entityId)}`,
        title: String(targeting.promotionTitle || ad.title || 'Promoted Post').trim(),
        subtitle: String(targeting.promotionSubtitle || 'Community Post').trim(),
        bodyDraft: String(ad.body || '').trim()
      };
    }

    if (promotionType === 'group') {
      const entityId = String(targeting.promotionEntityId || targeting.sourceId || '').trim();
      if (!entityId) return null;
      const entitySlug = String(targeting.promotionEntitySlug || targeting.sourceSlug || '').trim();
      const entityUrl =
        String(targeting.promotionEntityUrl || targeting.sourceUrl || '').trim() ||
        `${window.location.origin}/community/clubs?group=${encodeURIComponent(entitySlug || entityId)}`;
      return {
        type: 'group',
        entityId,
        entitySlug: entitySlug || undefined,
        entityUrl,
        title: String(targeting.promotionTitle || ad.title || 'Promoted Group').trim(),
        subtitle: String(targeting.promotionSubtitle || 'Community Group').trim(),
        bodyDraft: String(ad.body || '').trim()
      };
    }

    if (promotionType === 'page') {
      const entityId = String(targeting.promotionEntityId || '').trim();
      const entitySlug = String(targeting.promotionEntitySlug || '').trim();
      if (!entityId || !entitySlug) return null;
      return {
        type: 'page',
        entityId,
        entitySlug,
        entityUrl:
          String(targeting.promotionEntityUrl || '').trim() ||
          `${window.location.origin}/company/${encodeURIComponent(entitySlug)}`,
        title: String(targeting.promotionTitle || ad.title || 'Promoted Page').trim(),
        subtitle: String(targeting.promotionSubtitle || 'Business Page').trim(),
        bodyDraft: String(ad.body || '').trim()
      };
    }

    return null;
  }, []);

  const buildFormFromAd = useCallback(
    (ad: AdCampaign): AdFormState => {
      const targeting = getCampaignTargeting(ad);
      const placements = getCampaignPlacements(ad).slice(0, maxPlacements);
      const mediaFromAd =
        Array.isArray(ad.media) && ad.media.length > 0
          ? ad.media.map((media: any) => ({
              id: media.id || '',
              url: resolveAssetUrl(String(media.url || media.downloadUrl || media.thumbnailUrl || media.storagePath || media.path || '').trim()) || media.url,
              name: media.name,
              mimeType: media.mimeType,
              type: isAdVideoMedia(media) ? 'video' : 'image'
            }))
          : (ad.mediaFileIds || []).map((id) => ({ id } as any));

      return {
        title: ad.title || '',
        body: ad.body || '',
        objective: (ad.objective || 'traffic') as 'traffic' | 'messages',
        destinationType: (ad.destinationType || (ad.objective === 'messages' ? 'messages' : 'url')) as 'url' | 'messages',
        destinationUrl: ad.destinationUrl || '',
        ctaText: ad.ctaText || '',
        placements: placements.length ? placements : ['community_feed'],
        pricingModel: normalizePricingModel(targeting.pricingModel || (ad as any).pricingModel || 'CPM'),
        targetCountries: getCampaignCountries(ad),
        targetAudience: getCampaignAudience(ad),
        dailySpend: getCampaignDailySpend(ad),
        budget: toNumber(ad.budget),
        currency: ad.currency || selectedCurrency.code || 'USD',
        durationDays: toNumber(ad.durationDays || 7) || 7,
        media: mediaFromAd
      };
    },
    [maxPlacements, selectedCurrency.code]
  );

  const openCreate = () => {
    setFormMode('create');
    setEditingAdId(null);
    setPromotionSelection(null);
    setPromotionLoading(false);
    setForm(buildEmptyForm(selectedCurrency.code));
    setFormGatewayId(getPreferredCheckoutGatewayId());
    setFormOpen(true);
  };

  const openStudio = useCallback((ad: AdCampaign) => {
    setSelectedCampaignId(ad.id);
    window.requestAnimationFrame(() => {
      studioPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const openEdit = (ad: AdCampaign) => {
    setPromotionSelection(buildPromotionSelectionFromAd(ad));
    setPromotionLoading(false);
    setFormMode('edit');
    setEditingAdId(ad.id);
    setFormGatewayId(adGatewaySelections[ad.id] || getPreferredCheckoutGatewayId());
    setForm(buildFormFromAd(ad));
    setFormOpen(true);
    openStudio(ad);
  };

  const openDuplicate = (ad: AdCampaign) => {
    const duplicateForm = buildFormFromAd(ad);
    setFormMode('create');
    setEditingAdId(null);
    setPromotionSelection(buildPromotionSelectionFromAd(ad));
    setPromotionLoading(false);
    setForm({
      ...duplicateForm,
      title: `${duplicateForm.title || 'Ad campaign'} (Copy)`
    });
    setFormGatewayId(adGatewaySelections[ad.id] || getPreferredCheckoutGatewayId());
    setFormOpen(true);
    openStudio(ad);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this ad?')) return;
    try {
      await AdService.deleteCampaign(id);
      showNotification('success', 'Deleted', 'Ad removed.');
      setAds((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      showNotification('error', 'Delete failed', e?.message || 'Unable to delete ad.');
    }
  };

  const handleSubmit = async (adId: string) => {
    if (!confirm('Proceed to pay now? Paid campaigns are automatically submitted for review.')) return;
    setSubmittingId(adId);
    try {
      const ad = ads.find((entry) => entry.id === adId);
      const selectedGateway = resolveGatewaySelection(adId);
      const submitState = await submitAdWithAutoPayment(adId, {
        gatewayId: selectedGateway,
        currency: ad?.currency || form.currency
      });
      if (submitState.redirected) return;
      if (!submitState.submitted) {
        showNotification('error', 'Submit failed', submitState.message || 'Unable to submit ad.');
        await load();
        return;
      }
      showNotification('success', 'Submitted', submitState.message || 'Payment completed and ad submitted for review.');
      await load();
    } catch (e: any) {
      showNotification('error', 'Submit failed', e?.message || 'Unable to submit ad.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handlePause = async (adId: string) => {
    if (!confirm('Pause this ad?')) return;
    try {
      await AdService.pauseOwnAd(adId);
      showNotification('success', 'Paused', 'Ad paused successfully.');
      await load();
    } catch (e: any) {
      showNotification('error', 'Pause failed', e?.message || 'Unable to pause ad.');
    }
  };

  const handleResume = async (adId: string) => {
    if (!confirm('Resume this ad?')) return;
    try {
      await AdService.resumeOwnAd(adId);
      showNotification('success', 'Resumed', 'Ad resumed successfully.');
      await load();
    } catch (e: any) {
      showNotification('error', 'Resume failed', e?.message || 'Unable to resume ad.');
    }
  };

  const openRestart = (ad: AdCampaign) => {
    const durationDays = Math.max(1, Math.floor(toNumber(ad.durationDays) || 90));
    setRestartDraft({ ad, durationDays });
  };

  const handleRestart = async (ad: AdCampaign, requestedDurationDays: number) => {
    const durationDays = Math.max(1, Math.floor(toNumber(requestedDurationDays)));
    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      showNotification('warning', 'Invalid duration', 'Enter a valid number of days to restart this campaign.');
      return;
    }
    setRestartingId(ad.id);
    try {
      const result = await AdService.restartOwnAd(ad.id, { durationDays });
      const nextAd = result?.ad
        ? ({ ...(result.ad as AdCampaign), delivery: result?.delivery || (result.ad as AdCampaign).delivery } as AdCampaign)
        : null;
      if (nextAd?.id) {
        setAds((prev) => prev.map((entry) => (entry.id === nextAd.id ? { ...entry, ...nextAd } : entry)));
        setSelectedCampaignId(nextAd.id);
      }
      showNotification('success', 'Campaign restarted', `Ad flight restarted for ${durationDays} days.`);
      setRestartDraft(null);
      await load();
    } catch (e: any) {
      const blockers = Array.isArray(e?.response?.data?.data?.blockers)
        ? e.response.data.data.blockers.join(' ')
        : '';
      showNotification('error', 'Restart failed', blockers || e?.message || 'Unable to restart ad.');
    } finally {
      setRestartingId(null);
    }
  };

  const handleFormAction = async (mode: 'draft' | 'submit' | 'pay') => {
    if (!form.title.trim()) {
      showNotification('warning', 'Missing title', 'Please add a title for your ad.');
      return;
    }
    if (form.objective === 'traffic' && form.destinationType === 'url' && !form.destinationUrl.trim()) {
      showNotification('warning', 'Missing URL', 'Please add a destination URL for traffic ads.');
      return;
    }
    if (!Array.isArray(form.placements) || form.placements.length === 0) {
      showNotification('warning', 'Missing placement', 'Select at least one ad placement.');
      return;
    }
    if (form.placements.length > maxPlacements) {
      showNotification('warning', 'Placement limit', `You can select up to ${maxPlacements} placements.`);
      return;
    }
    if (toNumber(form.budget) < minBudget) {
      showNotification('warning', 'Budget too low', `Minimum ad budget is ${minBudget} ${form.currency}.`);
      return;
    }
    if (toNumber(form.budget) > maxBudget) {
      showNotification('warning', 'Budget too high', `Maximum ad budget is ${maxBudget} ${form.currency}.`);
      return;
    }
    if (toNumber(form.dailySpend) > 0 && toNumber(form.dailySpend) > toNumber(form.budget)) {
      showNotification('warning', 'Daily spend', 'Daily spend cannot exceed total budget.');
      return;
    }
    if (mediaCounts.images > maxImageAssets || mediaCounts.videos > maxVideoAssets) {
      showNotification(
        'warning',
        'Media limit',
        `Max media per ad: ${maxImageAssets} images and ${maxVideoAssets} video.`
      );
      return;
    }
    if ((mode === 'pay' || mode === 'submit') && normalizedPlacementsNeedCreative(form.placements) && form.media.length === 0) {
      showNotification(
        'warning',
        'Creative required',
        'Scroll ad placements require at least one image or video before payment and review.'
      );
      return;
    }
    if ((mode === 'pay' || mode === 'submit') && !formGatewayId) {
      showNotification('warning', 'Payment method', 'Select a payment method before paying.');
      return;
    }

    setFormActionMode(mode);
    setSaving(true);
    try {
      const targetCountries = Array.from(
        new Set(
          (Array.isArray(form.targetCountries) ? form.targetCountries : [])
            .map((entry) => entry.trim())
            .filter(Boolean)
        )
      );
      const pricingModel = normalizePricingModel(form.pricingModel);
      const destinationType = form.objective === 'messages' ? 'messages' : form.destinationType;
      const normalizedPlacements = Array.from(
        new Set((form.placements || []).map((placement) => normalizePlacement(placement)).filter(Boolean))
      ).slice(0, maxPlacements);
      const primaryPlacement = normalizedPlacements[0] || 'community_feed';
      const targetAudience = form.targetAudience || 'users';
      const dailySpend = toNumber(form.dailySpend) > 0 ? toNumber(form.dailySpend) : undefined;
      const promotionTargeting =
        promotionSelection && promotionSelection.type
          ? {
              promotionType: promotionSelection.type,
              promotionEntityId: promotionSelection.entityId,
              promotionEntitySlug:
                promotionSelection.type === 'page' ||
                promotionSelection.type === 'listing' ||
                promotionSelection.type === 'group'
                  ? promotionSelection.entitySlug || undefined
                  : undefined,
              promotionEntityUrl: promotionSelection.entityUrl,
              promotionTitle: promotionSelection.title,
              promotionSubtitle: promotionSelection.subtitle,
              sourceType:
                promotionSelection.type === 'listing'
                  ? 'MARKETPLACE_LISTING'
                  : promotionSelection.type === 'post'
                    ? 'COMMUNITY_POST'
                    : promotionSelection.type === 'page'
                      ? 'BUSINESS_PAGE'
                      : promotionSelection.type === 'group'
                        ? 'COMMUNITY_GROUP'
                        : undefined,
              sourceId: promotionSelection.entityId,
              sourceSlug:
                promotionSelection.entitySlug || undefined,
              sourceUrl: promotionSelection.entityUrl,
              sourceTitle: promotionSelection.title
            }
          : {};
      const payload: Partial<AdCampaign> = {
        title: form.title,
        body: form.body,
        objective: form.objective,
        destinationType,
        destinationUrl: destinationType === 'messages' ? null : form.destinationUrl,
        ctaText: form.ctaText,
        placement: primaryPlacement as any,
        placements: normalizedPlacements,
        pricingModel,
        computeOption: pricingModel,
        targetCountries,
        targetAudience,
        dailySpend,
        budget: form.budget,
        currency: form.currency,
        durationDays: form.durationDays,
        mediaFileIds: form.media.map((m) => m.id).filter(Boolean),
        targeting: {
          ...promotionTargeting,
          placements: normalizedPlacements,
          pricingModel,
          targetCountries,
          targetAudience,
          dailySpend
        }
      };

      let adId = editingAdId || '';
      if (formMode === 'create') {
        const createDraftAndSelect = async (nextPayload: Partial<AdCampaign>) => {
          const created = await AdService.createAdDraft(nextPayload);
          if (!created?.id) throw new Error('Unable to create ad draft.');
          adId = created.id;
          setFormMode('edit');
          setEditingAdId(created.id);
          return created;
        };

        try {
          await createDraftAndSelect(payload);
          if (mode === 'draft') {
            showNotification('success', 'Draft created', 'Ad draft saved.');
          }
        } catch (createError: any) {
          if (mode === 'draft') throw createError;

          showNotification(
            'warning',
            'Draft fallback',
            createError?.message || 'Unable to save full draft. Retrying with checkout-safe fields.'
          );

          const safeBudget = Math.max(minBudget, Math.min(maxBudget, toNumber(form.budget) || minBudget));
          const safeDuration = Math.max(1, Math.floor(toNumber(form.durationDays) || 7));
          const safeDestinationUrl =
            destinationType === 'messages'
              ? null
              : String(form.destinationUrl || '').trim() || `${window.location.origin}/`;

          const checkoutFallbackPayload: Partial<AdCampaign> = {
            title: form.title,
            body: form.body,
            objective: form.objective,
            destinationType,
            destinationUrl: safeDestinationUrl,
            ctaText: form.ctaText,
            placement: primaryPlacement as any,
            placements: normalizedPlacements,
            pricingModel,
            computeOption: pricingModel,
            budget: safeBudget,
            currency: form.currency || 'USD',
            durationDays: safeDuration,
            targeting: {
              ...promotionTargeting,
              placements: normalizedPlacements,
              pricingModel,
              targetCountries,
              targetAudience,
              dailySpend
            }
          };

          try {
            await createDraftAndSelect(checkoutFallbackPayload);
          } catch (fallbackError: any) {
            showNotification(
              'warning',
              'Minimal draft fallback',
              fallbackError?.message || 'Retrying with minimal campaign fields for checkout.'
            );

            const ultraMinimalPayload: Partial<AdCampaign> = {
              title: String(form.title || 'Ad campaign').trim() || 'Ad campaign',
              body: String(form.body || '').trim(),
              objective: form.objective === 'messages' ? 'messages' : 'traffic',
              destinationType: form.objective === 'messages' ? 'messages' : 'url',
              destinationUrl:
                form.objective === 'messages'
                  ? null
                  : String(form.destinationUrl || '').trim() || `${window.location.origin}/`,
              placement: primaryPlacement as any,
              placements: normalizedPlacements.length ? normalizedPlacements : [primaryPlacement],
              pricingModel,
              computeOption: pricingModel,
              budget: safeBudget,
              currency: form.currency || 'USD',
              durationDays: safeDuration,
              targeting: {
                ...promotionTargeting,
                promotionType: (promotionTargeting as any).promotionType,
                promotionEntityId: (promotionTargeting as any).promotionEntityId,
                promotionEntitySlug: (promotionTargeting as any).promotionEntitySlug,
                promotionEntityUrl: (promotionTargeting as any).promotionEntityUrl,
                promotionTitle: (promotionTargeting as any).promotionTitle,
                promotionSubtitle: (promotionTargeting as any).promotionSubtitle
              }
            };

            await createDraftAndSelect(ultraMinimalPayload);
          }
        }
      } else if (editingAdId) {
        adId = editingAdId;
        try {
          const updated = await AdService.updateAd(editingAdId, payload);
          if (!updated) throw new Error('Unable to update ad.');
          adId = updated.id || editingAdId;
          if (mode === 'draft') {
            const updatedStatus = normalizeCampaignStatus(updated.status);
            if (updatedStatus === 'submitted_for_review') {
              showNotification(
                'success',
                'Submitted for review',
                'Major campaign changes were saved and sent back to review automatically.'
              );
            } else {
              showNotification('success', 'Updated', 'Ad updated successfully.');
            }
          }
        } catch (updateError: any) {
          if (mode === 'draft') throw updateError;
          showNotification(
            'warning',
            'Using last saved draft',
            updateError?.message ||
              'Latest changes could not be saved. Continuing with your last saved ad for checkout.'
          );
        }
      }

      if (!adId) {
        throw new Error('Unable to resolve ad campaign id.');
      }

      if (mode === 'submit' || mode === 'pay') {
        const selectedGateway = resolveGatewaySelection(adId, formGatewayId, { preferFallback: true });
        const submitState = await submitAdWithAutoPayment(adId, {
          gatewayId: selectedGateway,
          currency: form.currency
        });
        if (submitState.redirected) return;
        if (!submitState.submitted) {
          const submitCode = String(submitState.code || '').trim().toUpperCase();
          const submitMessage = String(submitState.message || '').toLowerCase();
          const paymentRequired =
            submitCode === 'PAYMENT_REQUIRED' ||
            submitMessage.includes('payment required') ||
            submitMessage.includes('must be paid');
          if (paymentRequired) {
            const paymentState = await requestAdPayment(adId, {
              gatewayId: selectedGateway,
              currency: form.currency,
              pendingSubmit: true
            });
            if (paymentState.redirected) return;
          } else {
            const paymentRetry = await requestAdPayment(adId, {
              gatewayId: selectedGateway,
              currency: form.currency,
              pendingSubmit: true
            });
            if (paymentRetry.redirected) return;
          }
          showNotification('error', 'Submit failed', submitState.message || 'Unable to submit ad.');
          await load();
          return;
        }
        showNotification('success', 'Submitted', submitState.message || 'Payment completed and ad submitted for review.');
        setFormOpen(false);
        setEditingAdId(null);
        await load();
        return;
      }

      setFormOpen(false);
      setEditingAdId(null);
      await load();
    } catch (e: any) {
      const title =
        mode === 'submit' ? 'Submit failed' : mode === 'pay' ? 'Payment failed' : 'Save failed';
      showNotification('error', title, e?.message || 'Unable to save ad.');
    } finally {
      setFormActionMode(null);
      setSaving(false);
    }
  };

  const refreshPerformance = async (adId: string) => {
    setPerformanceLoading(true);
    try {
      const data = await AdService.getAdPerformance(adId);
      const nextAd = data?.ad
        ? ({ ...(data.ad as AdCampaign), delivery: data?.delivery || (data.ad as AdCampaign).delivery } as AdCampaign)
        : null;
      if (nextAd?.id) {
        setAds((prev) => prev.map((ad) => (ad.id === nextAd.id ? { ...ad, ...nextAd } : ad)));
      }
      setPerformanceAd((prev) => nextAd || prev || null);
      setPerformanceMetrics(Array.isArray(data?.metrics) ? data.metrics : Array.isArray(data?.daily) ? data.daily : []);
    } catch (e: any) {
      showNotification('error', 'Performance', e?.message || 'Unable to load performance.');
    } finally {
      setPerformanceLoading(false);
    }
  };

  const openPerformance = (ad: AdCampaign) => {
    setPerformanceAd(ad);
    setPerformanceMetrics([]);
    setPerformanceOpen(true);
    refreshPerformance(ad.id);
  };

  const appendMediaToForm = (files: AdFormState['media']) => {
    if (!Array.isArray(files) || files.length === 0) return;
    let blockedImages = 0;
    let blockedVideos = 0;
    setForm((prev) => {
      const nextMedia = [...prev.media];
      let imageCount = nextMedia.reduce((count, media) => {
        return isAdVideoMedia(media) ? count : count + 1;
      }, 0);
      let videoCount = nextMedia.reduce((count, media) => {
        return isAdVideoMedia(media) ? count + 1 : count;
      }, 0);

      for (const file of files) {
        if (!file?.id || nextMedia.some((media) => media.id === file.id)) continue;
        const isVideo = isAdVideoMedia(file);
        if (isVideo) {
          if (videoCount >= maxVideoAssets) {
            blockedVideos += 1;
            continue;
          }
          videoCount += 1;
        } else {
          if (imageCount >= maxImageAssets) {
            blockedImages += 1;
            continue;
          }
          imageCount += 1;
        }
        nextMedia.push({
          ...file,
          type: isVideo ? 'video' : file.type || 'image',
          mimeType: file.mimeType || file.mime_type || file.type
        });
      }

      return { ...prev, media: nextMedia };
    });
    if (blockedImages > 0 || blockedVideos > 0) {
      showNotification(
        'warning',
        'Media limit',
        `Only ${maxImageAssets} images and ${maxVideoAssets} video are allowed per ad campaign.`
      );
    }
  };

  const getCampaignCapabilities = useCallback((ad: AdCampaign) => {
    const status = normalizeCampaignStatus(ad.status);
    const flightEnded = isCampaignFlightEnded(ad);
    const canEdit = [
      'draft',
      'rejected',
      'awaiting_payment',
      'paid',
      'submitted_for_review',
      'approved',
      'active',
      'paused',
      'ended'
    ].includes(status);
    const canPay = ['draft', 'rejected', 'awaiting_payment'].includes(status);
    const canSubmit = ['draft', 'rejected', 'awaiting_payment', 'paid'].includes(status);
    const canDelete = [
      'draft',
      'rejected',
      'awaiting_payment',
      'paused',
      'ended',
      'paid',
      'submitted_for_review',
      'approved'
    ].includes(status);
    const canRestart = flightEnded || ['ended', 'completed'].includes(status);
    const canPause = status === 'active' && !canRestart;
    const canResume = status === 'paused' && !canRestart;
    const needsAction = canRestart || ['draft', 'rejected', 'awaiting_payment', 'paid'].includes(status);

    return {
      status,
      canEdit,
      canPay,
      canSubmit,
      canDelete,
      canPause,
      canResume,
      canRestart,
      needsAction,
      actionLabel:
        canRestart
          ? 'Restart flight'
          : status === 'awaiting_payment'
          ? 'Funding required'
          : status === 'paid'
            ? 'Ready to submit'
            : status === 'rejected'
              ? 'Needs revision'
              : status === 'draft'
                ? 'Draft in progress'
                : 'Healthy'
    };
  }, []);

  const performanceTotals = useMemo(() => {
    const totals = performanceMetrics.reduce(
      (acc, item) => {
        acc.impressions += toNumber(item.impressions);
        acc.clicks += toNumber(item.clicks);
        acc.spend += toNumber(item.spend);
        return acc;
      },
      { impressions: 0, clicks: 0, spend: 0 }
    );
    const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0;
    return { ...totals, ctr };
  }, [performanceMetrics]);

  const sortedMetrics = useMemo(() => {
    return [...performanceMetrics].sort((a, b) => {
      const da = new Date(a.date || a.day || 0).getTime();
      const db = new Date(b.date || b.day || 0).getTime();
      return db - da;
    });
  }, [performanceMetrics]);

  const performanceDelivery = performanceAd?.delivery || null;
  const performanceDeliveryBlockers = Array.isArray(performanceDelivery?.blockers)
    ? performanceDelivery.blockers
    : [];

  const studioPortfolio = useMemo(() => {
    return ads.reduce(
      (acc, ad) => {
        const budget = toNumber(ad.budget);
        const remaining = toNumber(ad.remainingBudget ?? budget);
        const spent = Math.max(0, budget - remaining);
        const statusGroup = getStatusGroup(ad.status);
        const capabilities = getCampaignCapabilities(ad);

        acc.total += 1;
        acc.budget += budget;
        acc.remaining += remaining;
        acc.spent += spent;
        acc.impressions += toNumber(ad.impressions);
        acc.clicks += toNumber(ad.clicks);
        if (statusGroup === 'active') acc.active += 1;
        if (statusGroup === 'review') acc.review += 1;
        if (capabilities.needsAction) acc.needsAction += 1;
        return acc;
      },
      {
        total: 0,
        active: 0,
        review: 0,
        needsAction: 0,
        budget: 0,
        remaining: 0,
        spent: 0,
        impressions: 0,
        clicks: 0
      }
    );
  }, [ads, getCampaignCapabilities]);

  const studioCtr = studioPortfolio.impressions
    ? (studioPortfolio.clicks / studioPortfolio.impressions) * 100
    : 0;

  const filteredAds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = ads.filter((ad) => {
      const targeting = getCampaignTargeting(ad);
      const placementText = getCampaignPlacements(ad).join(' ');
      const countryText = getCampaignCountries(ad).join(' ');
      const audience = getCampaignAudience(ad);
      const statusText = normalizeCampaignStatus(ad.status);

      const matchesSearch =
        !query ||
        [
          ad.title,
          ad.body,
          ad.id,
          ad.clientName,
          ad.destinationUrl,
          ad.ctaText,
          placementText,
          countryText,
          audience,
          statusText,
          targeting.promotionTitle,
          targeting.promotionSubtitle
        ]
          .map((value) => String(value || '').toLowerCase())
          .some((value) => value.includes(query));

      const group = getStatusGroup(ad.status);
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'action'
            ? getCampaignCapabilities(ad).needsAction
            : group === statusFilter;

      return matchesSearch && matchesStatus;
    });

    return filtered.sort((left, right) => {
      const leftBudget = toNumber(left.budget);
      const rightBudget = toNumber(right.budget);
      const leftRemaining = toNumber(left.remainingBudget ?? leftBudget);
      const rightRemaining = toNumber(right.remainingBudget ?? rightBudget);
      const leftSpent = Math.max(0, leftBudget - leftRemaining);
      const rightSpent = Math.max(0, rightBudget - rightRemaining);
      const leftCtr = toNumber(left.ctr);
      const rightCtr = toNumber(right.ctr);
      const leftCreated = new Date(left.createdAt || left.startAt || 0).getTime();
      const rightCreated = new Date(right.createdAt || right.startAt || 0).getTime();
      const leftPriority = getCampaignCapabilities(left).needsAction ? 1 : 0;
      const rightPriority = getCampaignCapabilities(right).needsAction ? 1 : 0;

      if (sortMode === 'budget_high') return rightBudget - leftBudget || rightCreated - leftCreated;
      if (sortMode === 'spend_high') return rightSpent - leftSpent || rightCreated - leftCreated;
      if (sortMode === 'best_ctr') return rightCtr - leftCtr || rightCreated - leftCreated;
      if (sortMode === 'attention') return rightPriority - leftPriority || rightCreated - leftCreated;
      return rightCreated - leftCreated;
    });
  }, [ads, getCampaignCapabilities, searchQuery, sortMode, statusFilter]);

  useEffect(() => {
    if (filteredAds.length === 0) {
      if (selectedCampaignId) setSelectedCampaignId(null);
      return;
    }
    if (!selectedCampaignId || !filteredAds.some((ad) => ad.id === selectedCampaignId)) {
      setSelectedCampaignId(filteredAds[0].id);
    }
  }, [filteredAds, selectedCampaignId]);

  const selectedAd = useMemo(
    () => filteredAds.find((ad) => ad.id === selectedCampaignId) || filteredAds[0] || null,
    [filteredAds, selectedCampaignId]
  );

  const selectedCapabilities = selectedAd ? getCampaignCapabilities(selectedAd) : null;
  const selectedStatusMeta = selectedAd ? getStatusMeta(selectedAd.status) : null;
  const selectedMedia = selectedAd ? getCampaignPrimaryMedia(selectedAd) : null;
  const selectedPlacements = selectedAd ? getCampaignPlacements(selectedAd) : [];
  const selectedCountries = selectedAd ? getCampaignCountries(selectedAd) : [];
  const selectedAudience = selectedAd ? getCampaignAudience(selectedAd) : 'users';
  const selectedBudget = toNumber(selectedAd?.budget);
  const selectedRemaining = toNumber(selectedAd?.remainingBudget ?? selectedBudget);
  const selectedSpent = Math.max(0, selectedBudget - selectedRemaining);
  const selectedSpendProgress = selectedBudget ? clampPercent((selectedSpent / selectedBudget) * 100) : 0;
  const selectedDelivery =
    performanceAd?.id === selectedAd?.id && performanceAd?.delivery
      ? performanceAd.delivery
      : selectedAd?.delivery || null;
  const selectedDeliveryBlockers = Array.isArray(selectedDelivery?.blockers) ? selectedDelivery.blockers : [];
  const selectedDeliveryWarnings = Array.isArray(selectedDelivery?.warnings) ? selectedDelivery.warnings : [];
  const selectedEligiblePlacements = Array.isArray(selectedDelivery?.eligiblePlacements)
    ? selectedDelivery.eligiblePlacements
    : [];

  const actionQueue = useMemo(
    () => ads.filter((ad) => getCampaignCapabilities(ad).needsAction).slice(0, 4),
    [ads, getCampaignCapabilities]
  );

  const formReadiness = useMemo(() => {
    const checks = [
      { label: 'Campaign title', complete: Boolean(form.title.trim()) },
      { label: 'Creative message', complete: Boolean(form.body.trim()) },
      {
        label: 'Destination',
        complete:
          form.objective === 'messages' ||
          form.destinationType === 'messages' ||
          Boolean(form.destinationUrl.trim())
      },
      { label: 'Placement strategy', complete: Array.isArray(form.placements) && form.placements.length > 0 },
      { label: 'Creative uploaded', complete: form.media.length > 0 || !normalizedPlacementsNeedCreative(form.placements) },
      { label: 'Budget configured', complete: toNumber(form.budget) >= minBudget },
      { label: 'Payment method', complete: Boolean(formGatewayId) }
    ];
    const completed = checks.filter((check) => check.complete).length;
    return {
      checks,
      completed,
      total: checks.length,
      score: Math.round((completed / checks.length) * 100)
    };
  }, [form.body, form.budget, form.destinationType, form.destinationUrl, form.media.length, form.objective, form.placements, form.title, formGatewayId, minBudget]);

  const formPreviewMedia = form.media[0] || null;
  const formPreviewMediaUrl = resolveAdRenderablePreviewUrl(formPreviewMedia);
  const formPlacementLabels = form.placements
    .map((placement) => placementOptions.find((option) => option.value === placement)?.label || placement)
    .slice(0, maxPlacements);
  const averageDailyBudget = form.durationDays > 0 ? toNumber(form.budget) / Math.max(1, toNumber(form.durationDays)) : toNumber(form.budget);
  const restartProjectedEndLabel = restartDraft
    ? new Date(Date.now() + Math.max(1, Math.floor(toNumber(restartDraft.durationDays) || 1)) * CAMPAIGN_DAY_MS)
        .toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const policySignals = [
    { label: 'Placement limit', value: `${maxPlacements} surfaces` },
    { label: 'Budget guardrail', value: `${formatCurrency(minBudget, form.currency)} to ${formatCurrency(maxBudget, form.currency)}` },
    { label: 'Creative capacity', value: `${maxImageAssets} images / ${maxVideoAssets} video` },
    { label: 'Checkout routes', value: paymentGateways.length > 0 ? `${paymentGateways.length} active` : 'No active gateways' }
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.18),_transparent_36%),linear-gradient(135deg,_#ffffff,_#f8fafc_55%,_#eef2ff)] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">
              <Megaphone className="h-3.5 w-3.5" />
              My Ads Studio
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Run campaigns with a cleaner, stronger ads command center.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 sm:text-[15px]">
                Plan creative, watch delivery health, resolve payment and review blockers, and keep campaign operations in one workspace without changing the existing ad rules or checkout flow.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                `${studioPortfolio.active} active`,
                `${studioPortfolio.review} in review`,
                `${studioPortfolio.needsAction} need attention`,
                `${formatCompactNumber(studioPortfolio.impressions)} impressions`
              ].map((chip) => (
                <span key={chip} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh data
            </button>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              Create campaign
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Portfolio budget</p>
              <Wallet className="h-4 w-4 text-sky-600" />
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-950">{formatCurrency(studioPortfolio.budget, selectedCurrency.code)}</p>
            <p className="mt-1 text-xs text-slate-500">Remaining {formatCurrency(studioPortfolio.remaining, selectedCurrency.code)}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Live engagement</p>
              <MousePointerClick className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-950">{formatCompactNumber(studioPortfolio.clicks)}</p>
            <p className="mt-1 text-xs text-slate-500">{studioCtr.toFixed(2)}% portfolio CTR</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Operational state</p>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-950">{studioPortfolio.active}</p>
            <p className="mt-1 text-xs text-slate-500">{studioPortfolio.review} in moderation or approval flow</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Priority queue</p>
              <Sparkles className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-950">{studioPortfolio.needsAction}</p>
            <p className="mt-1 text-xs text-slate-500">Campaigns requiring funding, fixes, or submission</p>
          </div>
        </div>
      </section>

      {!gatewayLoading && paymentGateways.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No active payment gateways are configured. Ask an admin to enable one.
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.95fr)]">
        <div className="space-y-4">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Campaign portfolio</p>
                <p className="text-xs text-slate-500">
                  Search, prioritize, and operate every campaign from one dashboard.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  {filteredAds.length} visible
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  {actionQueue.length} queued for action
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_200px_200px]">
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by title, placement, audience, URL, or promotion target"
                  className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Filter className="h-4 w-4 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StudioStatusFilter)}
                  className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none"
                >
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <BarChart3 className="h-4 w-4 text-slate-400" />
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as StudioSortMode)}
                  className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4">
              {[0, 1, 2].map((entry) => (
                <div
                  key={entry}
                  className="animate-pulse rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="h-5 w-1/3 rounded-full bg-slate-200" />
                  <div className="mt-4 aspect-[16/8] rounded-[1.25rem] bg-slate-100" />
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="h-16 rounded-2xl bg-slate-100" />
                    <div className="h-16 rounded-2xl bg-slate-100" />
                    <div className="h-16 rounded-2xl bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredAds.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                <Megaphone className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">No campaigns match this view</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Adjust your filters or create a new campaign. Existing billing, review, and delivery rules stay unchanged.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-700"
                >
                  <Plus className="h-4 w-4" />
                  Create campaign
                </button>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setSortMode('attention');
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reset filters
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAds.map((ad) => {
                const statusMeta = getStatusMeta(ad.status);
                const capabilities = getCampaignCapabilities(ad);
                const primaryMedia = getCampaignPrimaryMedia(ad);
                const placements = getCampaignPlacements(ad);
                const countries = getCampaignCountries(ad);
                const audience = getCampaignAudience(ad);
                const budget = toNumber(ad.budget);
                const remaining = toNumber(ad.remainingBudget ?? budget);
                const spent = Math.max(0, budget - remaining);
                const spendProgress = budget ? clampPercent((spent / budget) * 100) : 0;
                const targeting = getCampaignTargeting(ad);
                const promotionLabel =
                  targeting.promotionType === 'page'
                    ? 'Promoted page'
                    : targeting.promotionType === 'group'
                      ? 'Promoted group'
                      : targeting.promotionType === 'listing' || targeting.sourceType === 'MARKETPLACE_LISTING'
                      ? 'Boosted listing'
                    : targeting.promotionType === 'post'
                      ? 'Promoted post'
                      : 'Direct campaign';
                const isSelected = ad.id === selectedAd?.id;

                return (
                  <article
                    key={ad.id}
                    onClick={() => openStudio(ad)}
                    className={`overflow-hidden rounded-[1.75rem] border bg-white shadow-sm transition ${
                      isSelected
                        ? 'border-sky-400 shadow-[0_20px_60px_rgba(14,165,233,0.16)]'
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
                      <div className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-slate-950/95">
                        <div className="relative aspect-[16/10]">
                          {primaryMedia.url ? (
                            primaryMedia.type === 'video' ? (
                              <AdVideoPlayer
                                src={primaryMedia.url}
                                className="h-full w-full"
                                videoClassName="h-full w-full object-cover"
                                preload="auto"
                              />
                            ) : (
                              <img
                                src={primaryMedia.url}
                                alt={primaryMedia.name}
                                className="h-full w-full object-cover"
                              />
                            )
                          ) : (
                            <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_38%),linear-gradient(180deg,_#0f172a,_#1e293b)] text-center text-sm text-slate-300">
                              Creative preview will appear here
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/65 via-black/15 to-transparent px-4 py-3 text-white">
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] backdrop-blur">
                              <LayoutTemplate className="h-3.5 w-3.5" />
                              {promotionLabel}
                            </span>
                            <span className="rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
                              {placements.length} placements
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusMeta.badgeClass}`}
                              >
                                <span className={`h-2 w-2 rounded-full ${statusMeta.toneClass}`} />
                                {statusMeta.label}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                                <Clock3 className="h-3.5 w-3.5" />
                                {formatDateLabel(ad.createdAt || ad.startAt)}
                              </span>
                            </div>
                            <h3 className="mt-3 truncate text-lg font-semibold text-slate-950">{ad.title}</h3>
                            <p className="mt-1 text-sm leading-6 text-slate-500">{statusMeta.description}</p>
                          </div>
                          <button
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openStudio(ad);
                            }}
                            className="inline-flex items-center gap-2 self-start rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                          >
                            <Eye className="h-4 w-4" />
                            Open studio
                          </button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Budget
                            </p>
                            <p className="mt-2 text-base font-semibold text-slate-950">
                              {formatCurrency(budget, ad.currency)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatCurrency(remaining, ad.currency)} remaining
                            </p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Reach
                            </p>
                            <p className="mt-2 text-base font-semibold text-slate-950">
                              {formatCompactNumber(toNumber(ad.impressions))}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatCompactNumber(toNumber(ad.clicks))} clicks
                            </p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Performance
                            </p>
                            <p className="mt-2 text-base font-semibold text-slate-950">
                              {toNumber(ad.ctr).toFixed(2)}% CTR
                            </p>
                            <p className="mt-1 text-xs text-slate-500">{capabilities.actionLabel}</p>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                            <span>Budget usage</span>
                            <span>{spendProgress.toFixed(0)}%</span>
                          </div>
                          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-indigo-500"
                              style={{ width: `${spendProgress}%` }}
                            />
                          </div>
                        </div>

                        <AdDeliveryMatrix ad={ad} compact />

                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                            <Rocket className="h-3.5 w-3.5 text-sky-600" />
                            {String(ad.objective || 'traffic').replace(/^\w/, (value) => value.toUpperCase())}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                            <Wallet className="h-3.5 w-3.5 text-emerald-600" />
                            {normalizePricingModel(ad.pricingModel)} billing
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                            <LayoutTemplate className="h-3.5 w-3.5 text-indigo-600" />
                            {placements.slice(0, 2).join(' • ')}
                            {placements.length > 2 ? ` +${placements.length - 2}` : ''}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                            <Globe2 className="h-3.5 w-3.5 text-slate-500" />
                            {audience === 'all'
                              ? 'All audiences'
                              : audience === 'businesses'
                                ? 'Businesses'
                                : 'Users'}
                          </span>
                          {countries.length > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                              <Globe2 className="h-3.5 w-3.5 text-slate-500" />
                              {countries.slice(0, 2).join(', ')}
                              {countries.length > 2 ? ` +${countries.length - 2}` : ''}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              openPerformance(ad);
                            }}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                          >
                            <BarChart3 className="h-4 w-4" />
                            Performance
                          </button>
                          {capabilities.canEdit ? (
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                openEdit(ad);
                              }}
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                            >
                              <PencilLine className="h-4 w-4" />
                              Edit
                            </button>
                          ) : null}
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              openDuplicate(ad);
                            }}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                          >
                            <Copy className="h-4 w-4" />
                            Duplicate
                          </button>
                          {capabilities.canSubmit ? (
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleSubmit(ad.id);
                              }}
                              disabled={submittingId === ad.id}
                              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                            >
                              <Wallet className="h-4 w-4" />
                              {submittingId === ad.id
                                ? 'Processing...'
                                : 'Pay now'}
                            </button>
                          ) : null}
                          {capabilities.canPause ? (
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                void handlePause(ad.id);
                              }}
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                            >
                              <PauseCircle className="h-4 w-4" />
                              Pause
                            </button>
                          ) : null}
                          {capabilities.canResume ? (
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleResume(ad.id);
                              }}
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                            >
                              <PlayCircle className="h-4 w-4" />
                              Resume
                            </button>
                          ) : null}
                          {capabilities.canRestart ? (
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                openRestart(ad);
                              }}
                              disabled={restartingId === ad.id}
                              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <RefreshCw className={`h-4 w-4 ${restartingId === ad.id ? 'animate-spin' : ''}`} />
                              {restartingId === ad.id ? 'Restarting...' : 'Restart'}
                            </button>
                          ) : null}
                          {capabilities.canDelete ? (
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDelete(ad.id);
                              }}
                              className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside ref={studioPanelRef} className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Campaign studio</p>
                  <p className="text-xs text-slate-500">Selected campaign intelligence and controls.</p>
                </div>
                {selectedAd ? (
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${selectedStatusMeta?.badgeClass || 'border-slate-200 bg-slate-50 text-slate-600'}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${selectedStatusMeta?.toneClass || 'bg-slate-400'}`} />
                    {selectedStatusMeta?.label || 'Draft'}
                  </span>
                ) : null}
              </div>
            </div>

            {selectedAd ? (
              <div className="space-y-5 p-5">
                <div className="overflow-hidden rounded-[1.35rem] border border-slate-200 bg-slate-950">
                  <div className="relative aspect-[16/10]">
                    {selectedMedia?.url ? (
                      selectedMedia.type === 'video' ? (
                        <AdVideoPlayer
                          src={selectedMedia.url}
                          className="h-full w-full"
                          videoClassName="h-full w-full object-cover"
                          preload="auto"
                        />
                      ) : (
                        <img
                          src={selectedMedia.url}
                          alt={selectedMedia.name}
                          className="h-full w-full object-cover"
                        />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.2),_transparent_35%),linear-gradient(180deg,_#0f172a,_#1e293b)] text-center text-sm text-slate-300">
                        No creative uploaded yet
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 py-4 text-white">
                      <p className="truncate text-base font-semibold">{selectedAd.title}</p>
                      <p className="mt-1 text-xs text-white/75">{selectedCapabilities?.actionLabel}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Spend</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">
                      {formatCurrency(selectedSpent, selectedAd.currency)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatCurrency(selectedRemaining, selectedAd.currency)} remaining
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reach</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">
                      {formatCompactNumber(toNumber(selectedAd.impressions))}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatCompactNumber(toNumber(selectedAd.clicks))} clicks
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">CTR</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">
                      {toNumber(selectedAd.ctr).toFixed(2)}%
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {normalizePricingModel(selectedAd.pricingModel)} optimization
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Flight</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">
                      {selectedAd.durationDays || 0} days
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Created {formatDateLabel(selectedAd.createdAt || selectedAd.startAt)}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                    <span>Budget consumption</span>
                    <span>{selectedSpendProgress.toFixed(0)}%</span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-indigo-500"
                      style={{ width: `${selectedSpendProgress}%` }}
                    />
                  </div>
                </div>

                <div
                  className={`rounded-2xl border p-4 ${
                    selectedDelivery?.isServing
                      ? 'border-emerald-200 bg-emerald-50'
                      : selectedDelivery
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Delivery health
                      </p>
                      <p
                        className={`mt-2 text-sm font-semibold ${
                          selectedDelivery?.isServing
                            ? 'text-emerald-900'
                            : selectedDelivery
                              ? 'text-amber-900'
                              : 'text-slate-900'
                        }`}
                      >
                        {selectedDelivery?.summary || 'Open Performance to refresh serving diagnostics.'}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                        selectedDelivery?.isServing
                          ? 'bg-emerald-100 text-emerald-700'
                          : selectedDelivery
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          selectedDelivery?.isServing
                            ? 'bg-emerald-500'
                            : selectedDelivery
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                        }`}
                      />
                      {selectedDelivery?.isServing ? 'Serving' : selectedDelivery ? 'Blocked' : 'Unknown'}
                    </span>
                  </div>

                  {selectedEligiblePlacements.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedEligiblePlacements.map((placement) => (
                        <span
                          key={placement}
                          className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-700"
                        >
                          <LayoutTemplate className="h-3.5 w-3.5 text-emerald-600" />
                          {getPlacementLabel(placement)}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {selectedDeliveryBlockers.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {selectedDeliveryBlockers.slice(0, 3).map((reason) => (
                        <p key={reason} className="rounded-xl bg-white/75 px-3 py-2 text-xs leading-5 text-amber-900">
                          {reason}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {selectedDeliveryWarnings.length > 0 ? (
                    <p className="mt-3 text-xs leading-5 text-slate-600">
                      {selectedDeliveryWarnings.slice(0, 2).join(' ')}
                    </p>
                  ) : null}

                  <div className="mt-3">
                    <AdDeliveryMatrix ad={selectedAd} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => openPerformance(selectedAd)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Performance
                  </button>
                  {selectedCapabilities?.canRestart ? (
                    <button
                      onClick={() => openRestart(selectedAd)}
                      disabled={restartingId === selectedAd.id}
                      className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw className={`h-4 w-4 ${restartingId === selectedAd.id ? 'animate-spin' : ''}`} />
                      {restartingId === selectedAd.id ? 'Restarting...' : 'Restart flight'}
                    </button>
                  ) : null}
                  {selectedCapabilities?.canEdit ? (
                    <button
                      onClick={() => openEdit(selectedAd)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    >
                      <PencilLine className="h-4 w-4" />
                      Edit
                    </button>
                  ) : null}
                  <button
                    onClick={() => openDuplicate(selectedAd)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
                  {selectedAd.destinationUrl ? (
                    <a
                      href={selectedAd.destinationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                      Destination
                    </a>
                  ) : null}
                </div>

                {selectedAd.adminReviewNotes ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                      Admin review notes
                    </p>
                    <p className="mt-2 text-sm leading-6 text-amber-900">{selectedAd.adminReviewNotes}</p>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">Targeting and delivery</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedPlacements.map((placement) => (
                      <span
                        key={placement}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                      >
                        <LayoutTemplate className="h-3.5 w-3.5 text-indigo-600" />
                        {placement}
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      <Globe2 className="h-3.5 w-3.5 text-slate-500" />
                      {selectedAudience === 'all'
                        ? 'All audiences'
                        : selectedAudience === 'businesses'
                          ? 'Businesses'
                          : 'Users'}
                    </span>
                    {selectedCountries.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        <Globe2 className="h-3.5 w-3.5 text-slate-500" />
                        {selectedCountries.join(', ')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        <Globe2 className="h-3.5 w-3.5 text-slate-500" />
                        All configured regions
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 text-sm text-slate-500">
                Select a campaign to inspect creative, spend, delivery, and moderation details.
              </div>
            )}
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Priority queue</p>
                <p className="text-xs text-slate-500">Campaigns that need funding, edits, or moderation follow-up.</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="mt-4 space-y-3">
              {actionQueue.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  No campaigns currently need action.
                </div>
              ) : (
                actionQueue.map((ad) => {
                  const statusMeta = getStatusMeta(ad.status);
                  return (
                    <button
                      key={ad.id}
                      onClick={() => setSelectedCampaignId(ad.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{ad.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{getCampaignCapabilities(ad).actionLabel}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusMeta.badgeClass}`}>
                        {statusMeta.label}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Operational guardrails</p>
                <p className="text-xs text-slate-500">Live limits and billing controls from the existing ads configuration.</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-sky-600" />
            </div>
            <div className="mt-4 space-y-3">
              {policySignals.map((signal) => (
                <div key={signal.label} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-600">{signal.label}</span>
                  <span className="text-sm font-semibold text-slate-900">{signal.value}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-6xl overflow-y-auto rounded-[2rem] bg-white shadow-[0_32px_120px_rgba(15,23,42,0.24)] max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-200 p-6">
              <div>
                <h3 className="text-lg font-bold text-slate-950">
                  {formMode === 'create' ? 'Create Ad Campaign' : 'Edit Ad Campaign'}
                </h3>
                <p className="text-xs text-slate-500">
                  Drafts can be edited until payment is submitted.
                </p>
              </div>
              <button
                onClick={() => setFormOpen(false)}
                className="text-sm font-medium text-slate-400 transition hover:text-slate-700"
              >
                Close
              </button>
            </div>
            <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
              {promotionLoading ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
                  Preparing promotion target...
                </div>
              ) : promotionSelection ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                        Promoting{' '}
                        {promotionSelection.type === 'page'
                          ? 'Page'
                          : promotionSelection.type === 'listing'
                            ? 'Listing'
                            : promotionSelection.type === 'group'
                              ? 'Group'
                            : 'Post'}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-emerald-900">{promotionSelection.title}</p>
                      {promotionSelection.subtitle ? (
                        <p className="text-xs text-emerald-700">{promotionSelection.subtitle}</p>
                      ) : null}
                    </div>
                    <a
                      href={promotionSelection.entityUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded-full border border-emerald-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 hover:bg-emerald-100"
                    >
                      View target
                    </a>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel label="Ad title" help="A short headline users see first. Keep it clear and specific to your offer." />
                  <input
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Ad title"
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  />
                </div>
                <div>
                  <FieldLabel label="Objective" help="Traffic sends users to a URL. Messages opens direct conversation with you." />
                  <select
                    value={form.objective}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        objective: e.target.value as 'traffic' | 'messages',
                        destinationType: e.target.value === 'messages' ? 'messages' : prev.destinationType
                      }))
                    }
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  >
                    <option value="traffic">Objective: Traffic</option>
                    <option value="messages">Objective: Messages</option>
                  </select>
                </div>
              </div>
              <div>
                <FieldLabel label="Ad copy" help="Main message shown in the ad. Explain the value and include a clear call to action." />
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                  placeholder="Ad copy"
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  rows={3}
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">Where should this ad appear?</p>
                    <GuideTip text="Choose up to the configured limit. The first selected placement is used as the primary placement for pricing." />
                  </div>
                  <span className="text-xs text-gray-500">Select up to {maxPlacements}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {placementOptions.map((option) => {
                    const selected = form.placements.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            setForm((prev) => ({
                              ...prev,
                              placements: prev.placements.filter((placement) => placement !== option.value)
                            }));
                            return;
                          }
                          if (form.placements.length >= maxPlacements) {
                            showNotification(
                              'warning',
                              'Placement limit',
                              `You can choose up to ${maxPlacements} placements.`
                            );
                            return;
                          }
                          setForm((prev) => ({
                            ...prev,
                            placements: [...prev.placements, option.value]
                          }));
                        }}
                        className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                          selected
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel label="Destination type" help="Choose whether clicks go to your URL or open direct messages." />
                  <select
                    value={form.destinationType}
                    onChange={(e) => setForm((prev) => ({ ...prev, destinationType: e.target.value as 'url' | 'messages' }))}
                    disabled={form.objective === 'messages'}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  >
                    <option value="url">Send users to URL</option>
                    <option value="messages">Receive messages</option>
                  </select>
                </div>
                <div>
                  <FieldLabel label="Billing model" help="CPM charges per 1,000 impressions. CPC charges per click." />
                  <select
                    value={form.pricingModel}
                    onChange={(e) => setForm((prev) => ({ ...prev, pricingModel: normalizePricingModel(e.target.value) }))}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  >
                    <option value="CPM">Cost Per Mille (CPM)</option>
                    <option value="CPC">Cost Per Click (CPC)</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel label="Destination URL" help="Where users are sent when they click. Required for URL destination ads." />
                  <input
                    value={form.destinationUrl}
                    onChange={(e) => setForm((prev) => ({ ...prev, destinationUrl: e.target.value }))}
                    placeholder="Destination URL (https://...)"
                    disabled={form.destinationType === 'messages'}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  />
                </div>
                <div>
                  <FieldLabel label="CTA text" help="Optional button label displayed on the ad, such as Learn More or Send Message." />
                  <input
                    value={form.ctaText}
                    onChange={(e) => setForm((prev) => ({ ...prev, ctaText: e.target.value }))}
                    placeholder="CTA text (optional)"
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel label="Target countries" help="Select one or more countries to limit where your ad is served." />
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const nextCountry = String(e.target.value || '').trim();
                      if (!nextCountry) return;
                      setForm((prev) => ({
                        ...prev,
                        targetCountries: Array.from(new Set([...(prev.targetCountries || []), nextCountry]))
                      }));
                      e.currentTarget.value = '';
                    }}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  >
                    <option value="" disabled>
                      Choose country
                    </option>
                    {availableTargetCountries.map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.targetCountries.map((country) => (
                      <span key={country} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                        {country}
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              targetCountries: prev.targetCountries.filter((entry) => entry !== country)
                            }))
                          }
                          className="rounded px-1 text-blue-700 hover:bg-blue-100"
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                  {form.targetCountries.length === 0 && (
                    <p className="mt-1 text-xs text-gray-500">No country selected. Your ad can run in all allowed regions.</p>
                  )}
                </div>
                <div>
                  <FieldLabel label="Target audience" help="Choose whether to target individual users, businesses, or everyone." />
                  <select
                    value={form.targetAudience}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        targetAudience: e.target.value as 'users' | 'businesses' | 'all'
                      }))
                    }
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  >
                    <option value="users">Target audience: Users</option>
                    <option value="businesses">Target audience: Company/Businesses</option>
                    <option value="all">Target audience: All</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <FieldLabel label="Total budget" help="Total campaign spend. Minimum and maximum are controlled by admin rules." />
                  <input
                    type="number"
                    min={0}
                    value={form.budget}
                    onChange={(e) => setForm((prev) => ({ ...prev, budget: toNumber(e.target.value) }))}
                    placeholder={`Budget (min ${minBudget})`}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  />
                </div>
                <div>
                  <FieldLabel label="Currency" help="Billing currency for this campaign and estimated outcomes." />
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  >
                    {currencyOptions.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel label="Duration" help="Number of days the campaign should run once approved and active." />
                  <input
                    type="number"
                    min={1}
                    value={form.durationDays}
                    onChange={(e) => setForm((prev) => ({ ...prev, durationDays: toNumber(e.target.value || 1) }))}
                    placeholder="Duration (days)"
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  />
                </div>
                <div>
                  <FieldLabel label="Daily spend cap" help="Optional daily cap. Leave 0 to let spend distribute naturally over campaign duration." />
                  <input
                    type="number"
                    min={0}
                    value={form.dailySpend}
                    onChange={(e) => setForm((prev) => ({ ...prev, dailySpend: toNumber(e.target.value || 0) }))}
                    placeholder="Daily spend"
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
                <div className="flex flex-wrap items-center gap-4">
                  <span>
                    Primary placement: <strong>{placementOptions.find((option) => option.value === primaryPlacement)?.label || primaryPlacement}</strong>
                  </span>
                  <span>
                    Rate: <strong>{form.pricingModel === 'CPM' ? `${activeRates.cpm || 0} ${form.currency}/1,000 views` : `${activeRates.cpc || 0} ${form.currency}/click`}</strong>
                  </span>
                  <span>
                    Estimated {form.pricingModel === 'CPM' ? 'views' : 'clicks'}:{' '}
                    <strong>{form.pricingModel === 'CPM' ? estimatedOutcomes.impressions : estimatedOutcomes.clicks}</strong>
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">Media</p>
                      <GuideTip text="Upload visual assets for your ad. Limits are enforced by admin policy and shown below." />
                    </div>
                    <p className="text-xs text-gray-500">
                      Upload up to {maxImageAssets} images and {maxVideoAssets} video. Video previews autoplay muted; use the sound control to test audio.
                    </p>
                  </div>
                  <button
                    onClick={() => setMediaPickerOpen(true)}
                    className="px-3 py-1 rounded bg-gray-100 text-gray-700 text-sm"
                  >
                    Add Media
                  </button>
                </div>
                {form.media.length > 0 && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {form.media.map((media) => {
                      const mediaUrl = resolveAdRenderablePreviewUrl(media);
                      return (
                      <div key={media.id} className="border rounded-xl p-2 flex items-center gap-3">
                        {mediaUrl ? (
                          isAdVideoMedia(media) ? (
                            <AdVideoPlayer
                              key={mediaUrl}
                              src={mediaUrl}
                              className="h-16 w-16 rounded-lg"
                              videoClassName="h-full w-full object-cover"
                              preload="auto"
                              soundButtonClassName="right-1 top-1 h-7 min-w-7 px-1"
                              showSoundLabel={false}
                            />
                          ) : (
                            <img src={mediaUrl} alt={media.name || 'media'} className="w-16 h-16 object-cover rounded-lg" />
                          )
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-500">File</div>
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium">{media.name || media.id}</p>
                          <p className="text-xs text-gray-500">{media.mimeType || media.type || 'media'}</p>
                        </div>
                        <button
                          onClick={() => setForm((prev) => ({ ...prev, media: prev.media.filter((m) => m.id !== media.id) }))}
                          className="text-xs text-red-500"
                        >
                          Remove
                        </button>
                      </div>
                    );
                    })}
                  </div>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  Available payment methods are shown live from your active checkout configuration.
                </div>
                <div>
                  <FieldLabel label="Payment method" help="Select the payment provider to fund this ad campaign before review." />
                  <select
                    value={formGatewayId}
                    onChange={(e) => setFormGatewayId(e.target.value)}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                    disabled={gatewayLoading || paymentGateways.length === 0}
                  >
                    {gatewayLoading ? (
                      <option value="">Loading...</option>
                    ) : paymentGateways.length === 0 ? (
                      <option value="">No active gateways</option>
                    ) : (
                      paymentGateways.map((gateway) => (
                        <option key={gateway.id} value={gateway.id}>
                          {getUserFacingPaymentMethodName(gateway)}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              </div>

              <div className="space-y-4">
                <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">Live preview</p>
                    <p className="text-xs text-slate-500">How this campaign is shaping up before payment or review.</p>
                  </div>
                  <div className="p-4">
                    <div className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-slate-950">
                      <div className="relative aspect-[4/5]">
                        {formPreviewMediaUrl ? (
                          isAdVideoMedia(formPreviewMedia) ? (
                            <AdVideoPlayer
                              key={formPreviewMediaUrl}
                              src={formPreviewMediaUrl}
                              className="h-full w-full"
                              videoClassName="h-full w-full object-cover"
                              preload="auto"
                            />
                          ) : (
                            <img
                              src={formPreviewMediaUrl}
                              alt={formPreviewMedia?.name || form.title || 'Ad preview'}
                              className="h-full w-full object-cover"
                            />
                          )
                        ) : (
                          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_35%),linear-gradient(180deg,_#0f172a,_#1e293b)] px-6 text-center text-sm text-slate-300">
                            Upload creative to unlock a richer ad preview.
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent px-4 py-4 text-white">
                          <p className="text-xs uppercase tracking-[0.18em] text-white/70">
                            {promotionSelection
                              ? promotionSelection.type === 'page'
                                ? 'Promoted page'
                                : promotionSelection.type === 'listing'
                                  ? 'Boosted listing'
                                  : promotionSelection.type === 'group'
                                    ? 'Promoted group'
                                    : 'Promoted post'
                              : 'Campaign preview'}
                          </p>
                          <p className="mt-2 line-clamp-2 text-base font-semibold">
                            {form.title || 'Campaign title'}
                          </p>
                          <p className="mt-1 line-clamp-3 text-sm text-white/75">
                            {form.body || 'Your primary message will appear here.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {(formPlacementLabels.length > 0 ? formPlacementLabels : ['No placement selected']).map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                        >
                          <LayoutTemplate className="h-3.5 w-3.5 text-indigo-600" />
                          {label}
                        </span>
                      ))}
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        <Globe2 className="h-3.5 w-3.5 text-slate-500" />
                        {form.targetAudience === 'all'
                          ? 'All audiences'
                          : form.targetAudience === 'businesses'
                            ? 'Businesses'
                            : 'Users'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Launch readiness</p>
                      <p className="text-xs text-slate-500">{formReadiness.score}% complete</p>
                    </div>
                    <div className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700">
                      {formReadiness.completed}/{formReadiness.total}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {formReadiness.checks.map((check) => (
                      <div key={check.label} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
                        <span className="text-sm text-slate-600">{check.label}</span>
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${check.complete ? 'text-emerald-600' : 'text-amber-600'}`}>
                          <CheckCircle2 className="h-4 w-4" />
                          {check.complete ? 'Ready' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">Budget planner</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Daily average</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">
                        {formatCurrency(averageDailyBudget, form.currency)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Estimated outcome</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">
                        {form.pricingModel === 'CPM'
                          ? `${formatCompactNumber(estimatedOutcomes.impressions)} impressions`
                          : `${formatCompactNumber(estimatedOutcomes.clicks)} clicks`}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Checkout route</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">
                        {paymentGateways.find((gateway) => gateway.id === formGatewayId)
                          ? getUserFacingPaymentMethodName(paymentGateways.find((gateway) => gateway.id === formGatewayId) as PaymentGateway)
                          : 'Select method'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">Policy and ops</p>
                  <div className="mt-4 space-y-2">
                    {policySignals.map((signal) => (
                      <div key={signal.label} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
                        <span className="text-sm text-slate-600">{signal.label}</span>
                        <span className="text-sm font-semibold text-slate-900">{signal.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 p-6">
              <button
                onClick={() => setFormOpen(false)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
              >
                Cancel
              </button>
              <button
                onClick={() => handleFormAction('draft')}
                disabled={saving}
                className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
              >
                {saving && formActionMode === 'draft'
                  ? formMode === 'create'
                    ? 'Saving...'
                    : 'Updating...'
                  : formMode === 'create'
                    ? 'Save Draft'
                    : 'Save Changes'}
              </button>
              <button
                onClick={() => handleFormAction('pay')}
                disabled={saving || gatewayLoading || paymentGateways.length === 0 || !formGatewayId}
                className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:bg-slate-300"
              >
                {saving && formActionMode === 'pay' ? 'Processing payment...' : 'Pay now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {restartDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-[0_32px_120px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">Restart campaign flight</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {restartDraft.ad.title || 'Campaign'} will restart immediately with a refreshed delivery window.
                </p>
              </div>
              <button
                onClick={() => setRestartDraft(null)}
                className="text-sm font-medium text-slate-400 transition hover:text-slate-700"
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <FieldLabel label="Run time" help="Number of days this campaign should run from today." />
                <input
                  type="number"
                  min={1}
                  value={restartDraft.durationDays}
                  onChange={(event) =>
                    setRestartDraft((current) =>
                      current
                        ? {
                            ...current,
                            durationDays: Math.max(1, Math.floor(toNumber(event.target.value || 1)))
                          }
                        : current
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm"
                />
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">New flight window</p>
                <p className="mt-2 text-sm text-emerald-900">
                  Starts now and runs through <strong>{restartProjectedEndLabel}</strong>.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setRestartDraft(null)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRestart(restartDraft.ad, restartDraft.durationDays)}
                disabled={restartingId === restartDraft.ad.id}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <RefreshCw className={`h-4 w-4 ${restartingId === restartDraft.ad.id ? 'animate-spin' : ''}`} />
                {restartingId === restartDraft.ad.id ? 'Restarting...' : 'Restart campaign'}
              </button>
            </div>
          </div>
        </div>
      )}

      <FilePickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelectMultiple={(files) => {
          appendMediaToForm(
            files.map((file) => ({
              id: file.id,
              url: file.url,
              name: file.name,
              mimeType: file.mimeType,
              type: file.type
            }))
          );
        }}
        onSelect={(file) => {
          appendMediaToForm([
            { id: file.id, url: file.url, name: file.name, mimeType: file.mimeType, type: file.type }
          ]);
        }}
        multiple
        allowUpload
        filterType="all"
        acceptedTypes={['image', 'video']}
        title="Select Ad Media"
        role={user?.role}
        visibility="public"
      />

      {performanceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h3 className="text-lg font-bold">Ad Performance</h3>
                <p className="text-xs text-gray-500">{performanceAd?.title}</p>
              </div>
              <button
                onClick={() => setPerformanceOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                Close
              </button>
            </div>
            <div className="p-6 space-y-4">
              {performanceLoading ? (
                <div className="text-sm text-gray-500">Loading performance...</div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="p-4 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500">Impressions</p>
                      <p className="text-lg font-semibold">{performanceTotals.impressions}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500">Clicks</p>
                      <p className="text-lg font-semibold">{performanceTotals.clicks}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500">CTR</p>
                      <p className="text-lg font-semibold">{performanceTotals.ctr.toFixed(2)}%</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500">Spend</p>
                      <p className="text-lg font-semibold">
                        {formatCurrency(performanceTotals.spend, performanceAd?.currency)}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`rounded-xl border p-4 ${
                      performanceDelivery?.isServing
                        ? 'border-emerald-200 bg-emerald-50'
                        : performanceDelivery
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Serving diagnostics
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {performanceDelivery?.summary || 'No delivery diagnostics returned yet.'}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold text-slate-700">
                        {performanceDelivery?.isServing ? 'Eligible' : performanceDelivery ? 'Needs attention' : 'Unknown'}
                      </span>
                    </div>
                    {performanceDeliveryBlockers.length > 0 ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {performanceDeliveryBlockers.slice(0, 4).map((reason) => (
                          <p key={reason} className="rounded-lg bg-white/75 px-3 py-2 text-xs leading-5 text-amber-900">
                            {reason}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {performanceAd ? (
                      <div className="mt-3">
                        <AdDeliveryMatrix ad={performanceAd} />
                      </div>
                    ) : null}
                  </div>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-left">Impressions</th>
                          <th className="px-4 py-2 text-left">Clicks</th>
                          <th className="px-4 py-2 text-left">Spend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedMetrics.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                              No metrics yet.
                            </td>
                          </tr>
                        ) : (
                          sortedMetrics.slice(0, 10).map((metric, idx) => (
                            <tr key={`${metric.date || idx}`} className="border-t">
                              <td className="px-4 py-2">
                                {metric.date ? new Date(metric.date).toLocaleDateString() : '-'}
                              </td>
                              <td className="px-4 py-2">{toNumber(metric.impressions)}</td>
                              <td className="px-4 py-2">{toNumber(metric.clicks)}</td>
                              <td className="px-4 py-2">{formatCurrency(toNumber(metric.spend), performanceAd?.currency)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyAds;

