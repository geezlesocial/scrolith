import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  Camera,
  CheckCircle2,
  CreditCard,
  Eye,
  LayoutGrid,
  Megaphone,
  RefreshCw,
  Share2,
  ShieldCheck,
  UserCircle,
  Users
} from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { CommunityService } from '../../services/community';
import { AdService } from '../../services/ads';
import { FileService } from '../../services/files';
import { UserService } from '../../services/user';
import { PaymentService } from '../../services/payment';
import api from '../../services/api';
import { useCurrency } from '../../context/CurrencyContext';
import { AdCampaign, PaymentGateway } from '../../types';
import FilePickerModal from './FilePickerModal';

const tabs = [
  { id: 'feed', label: 'Community Feed', icon: LayoutGrid },
  { id: 'ads', label: 'Ads Manager', icon: Megaphone },
  { id: 'business', label: 'Business Page', icon: Building2 },
  { id: 'network', label: 'Network', icon: Users },
  { id: 'profile', label: 'Profile', icon: UserCircle },
  { id: 'insights', label: 'Insights', icon: BarChart3 }
] as const;

type TabId = typeof tabs[number]['id'];

type CreatorProfile = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  bio?: string;
  followersCount?: number;
  followingCount?: number;
  following?: boolean;
};

type BusinessPage = {
  id?: string;
  name: string;
  tagline: string;
  category: string;
  industry: string;
  orgSize: string;
  orgType: string;
  slug: string;
  website: string;
  email: string;
  phone: string;
  location: string;
  description: string;
  logoUrl: string;
  coverUrl: string;
  followers: string[];
  googleBusinessEnabled: boolean;
  googlePlaceId: string;
  googleAnalyticsId: string;
};

type CommunityPost = {
  id: string;
  title?: string;
  content?: string;
  attachments?: { url: string; id: string }[];
  userName?: string;
  userAvatar?: string;
  createdAt?: string;
  tags?: string[];
  mentions?: string[];
};

type PostDraft = {
  title: string;
  content: string;
  tags: string;
  mentions: string;
  media: { id: string; url: string }[];
};

const emptyBusiness: BusinessPage = {
  id: '',
  name: '',
  tagline: '',
  category: '',
  industry: '',
  orgSize: '',
  orgType: '',
  slug: '',
  website: '',
  email: '',
  phone: '',
  location: '',
  description: '',
  logoUrl: '',
  coverUrl: '',
  followers: [],
  googleBusinessEnabled: false,
  googlePlaceId: '',
  googleAnalyticsId: ''
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
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 60);

const CommunityDashboard: React.FC = () => {
  const { user, updateUser } = useUser();
  const { showNotification } = useNotification();
  const { availableCurrencies } = useCurrency();
  const [activeTab, setActiveTab] = useState<TabId>('feed');
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [followers, setFollowers] = useState<CreatorProfile[]>([]);
  const [following, setFollowing] = useState<CreatorProfile[]>([]);
  const [suggested, setSuggested] = useState<CreatorProfile[]>([]);
  const [insights, setInsights] = useState({
    gcoin: 0,
    earnings: 0,
    followers: 0,
    activeAds: 0,
    engagement: 0
  });
  const [business, setBusiness] = useState<BusinessPage>(emptyBusiness);
  const [businessPages, setBusinessPages] = useState<BusinessPage[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<string>('');
  const [businessSaving, setBusinessSaving] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [selectedGatewayId, setSelectedGatewayId] = useState('');
  const [showAdMediaPicker, setShowAdMediaPicker] = useState(false);
  const [adsConfig, setAdsConfig] = useState<any>(null);
  const [postDraft, setPostDraft] = useState<PostDraft>({
    title: '',
    content: '',
    tags: '',
    mentions: '',
    media: []
  });
  const [posting, setPosting] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileBio, setProfileBio] = useState('');
  const [profileUsername, setProfileUsername] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<{ id?: string; url?: string }>({});
  const [adDraft, setAdDraft] = useState({
    title: '',
    body: '',
    placement: 'feed',
    budget: 120,
    currency: 'USD',
    targetUrl: '',
    targetRoles: ['freelancer', 'employer'],
    media: [] as { id: string; url: string; name?: string }[],
    durationDays: 7,
    destinationType: 'url' as 'url' | 'messages'
  });
  const [adActionLoading, setAdActionLoading] = useState(false);
  const [paymentProcessingId, setPaymentProcessingId] = useState<string | null>(null);

  const businessStorageKey = useMemo(() => (user ? `community_business_${user.id}` : 'community_business_global'), [user]);
  const globalBusinessKey = 'community_business_pages';
  const formattedUserName = `${user?.name || user?.username || 'Community member'}`;

  const normalizeCreator = (payload: any): CreatorProfile => ({
    id: payload?.id || payload?.userId || payload?.user_id || '',
    name: payload?.name || payload?.fullName || payload?.user_name || payload?.email || 'Community member',
    username: payload?.username || payload?.handle,
    avatar: payload?.avatar || payload?.user_avatar || payload?.userAvatar,
    bio: payload?.bio || payload?.tagline,
    followersCount: Number(payload?.followersCount ?? payload?.followers_count ?? 0),
    followingCount: Number(payload?.followingCount ?? payload?.following_count ?? 0),
    following: Boolean(payload?.following ?? payload?.isFollowing)
  });

  const fetchFollowers = useCallback(async () => {
    if (!user) return [];
    try {
      const response = await api.get(`/users/${user.id}/followers`);
      const data = response?.data?.data ?? response?.data ?? [];
      return Array.isArray(data) ? data.map(normalizeCreator) : [];
    } catch (error) {
      console.warn('followers error', error);
      return [];
    }
  }, [user]);

  const fetchFollowing = useCallback(async () => {
    if (!user) return [];
    try {
      const response = await api.get(`/users/${user.id}/following`);
      const data = response?.data?.data ?? response?.data ?? [];
      return Array.isArray(data) ? data.map(normalizeCreator) : [];
    } catch (error) {
      console.warn('following error', error);
      return [];
    }
  }, [user]);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [postData, adData, topCreators, analytics, followersData, followingData, adConfig] = await Promise.all([
        CommunityService.getPosts({ limit: 8 }),
        AdService.getMyAds(),
        CommunityService.getTopContributors(6),
        CommunityService.getAnalytics(),
        fetchFollowers(),
        fetchFollowing(),
        AdService.getConfig()
      ]);
      setPosts(
        postData
          .slice(0, 8)
          .map((post) => ({
            id: post.id || `${post.userId || post.user_id}-${Date.now()}`,
            title: post.title,
            content: post.content,
            attachments: (post.attachments || []).map((item: any) => ({ id: item.id || item.fileId, url: item.url })),
            userName: post.userName || post.user_name || formattedUserName,
            userAvatar: post.userAvatar || post.user_avatar,
            createdAt: post.createdAt || post.created_at,
            tags: post.tags || [],
            mentions: post.mentions || []
          }))
      );
      setAds(adData);
      setSuggested(topCreators.map(normalizeCreator));
      setInsights((prev) => ({
        gcoin: analytics?.gcoin ?? prev.gcoin,
        earnings: analytics?.earnings ?? analytics?.revenue ?? prev.earnings,
        followers: analytics?.followers ?? prev.followers,
        activeAds: adData.filter((ad) => ad.status?.toLowerCase() === 'active').length,
        engagement: analytics?.engagementScore ?? prev.engagement
      }));
      setFollowers(followersData);
      setFollowing(followingData);
      setAdsConfig(adConfig || null);
      const storedBusiness = localStorage.getItem(businessStorageKey);
      if (storedBusiness) {
        const parsed = JSON.parse(storedBusiness);
        const pages = Array.isArray(parsed) ? parsed : [parsed];
        const normalizedPages = pages.map((page) => ({
          ...emptyBusiness,
          ...page,
          id: page.id || `biz-${Date.now()}`,
          followers: Array.isArray(page.followers) ? page.followers : [],
          slug: page.slug || toSlug(page.name || formattedUserName)
        }));
        setBusinessPages(normalizedPages);
        const first = normalizedPages[0];
        setBusiness(first);
        setActiveBusinessId(first.id || '');
      } else {
        const fresh = {
          ...emptyBusiness,
          id: `biz-${Date.now()}`,
          name: formattedUserName,
          slug: toSlug(formattedUserName)
        };
        setBusinessPages([fresh]);
        setBusiness(fresh);
        setActiveBusinessId(fresh.id || '');
      }
      try {
        const isAdmin = (user?.role || '').toString().toLowerCase().includes('admin');
        const gateways = isAdmin ? await PaymentService.getGateways() : await PaymentService.getPublicGateways();
        setPaymentGateways(gateways);
        if (!selectedGatewayId && gateways.length > 0) {
          setSelectedGatewayId(gateways[0].id);
        }
      } catch (error) {
        console.warn('Payment gateways unavailable', error);
        setPaymentGateways([]);
      }
    } catch (error) {
      console.error(error);
      showNotification('error', 'Community', 'Unable to load community dashboard yet.');
    } finally {
      setLoading(false);
    }
  }, [user, formattedUserName, fetchFollowers, fetchFollowing, businessStorageKey, showNotification, selectedGatewayId]);

  useEffect(() => {
    if (user) {
      loadDashboard();
      setProfileBio(user.bio || '');
      setProfileUsername(user.username || user.email || '');
      setProfilePhoto({ id: user.profilePhotoFileId, url: user.avatar });
    }
  }, [user, loadDashboard]);

  useEffect(() => {
    if (business.name && !business.slug) {
      setBusiness((prev) => ({ ...prev, slug: toSlug(prev.name) }));
    }
  }, [business.name, business.slug]);

  const safeNumber = (value: any) => (typeof value === 'number' ? value : Number(value ?? 0));
  const currencyOptions = useMemo(
    () => availableCurrencies.filter((c) => c.isActive ?? true),
    [availableCurrencies]
  );
  const availableGateways = useMemo(() => {
    const currency = adDraft.currency || 'USD';
    return paymentGateways.filter((g: any) => {
      const enabled = g.is_enabled ?? g.isEnabled ?? g.enabled ?? g.active ?? true;
      if (!enabled) return false;
      const currencies =
        g.supported_currencies ??
        g.supportedCurrencies ??
        g.currencies ??
        g.supported_currency ??
        g.supportedCurrency ??
        [];
      if (!currencies || (Array.isArray(currencies) && currencies.length === 0)) return true;
      if (Array.isArray(currencies)) return currencies.includes(currency);
      return String(currencies).split(',').map((c) => c.trim()).includes(currency);
    });
  }, [adDraft.currency, paymentGateways]);

  const adRateCard = useMemo(() => {
    const placement = adDraft.placement || 'feed';
    const cpm = Number(adsConfig?.cpmByPlacement?.[placement] ?? 0);
    const cpc = Number(adsConfig?.cpcByPlacement?.[placement] ?? 0);
    return { cpm, cpc };
  }, [adsConfig, adDraft.placement]);

  const estimatedImpressions = useMemo(() => {
    if (!adRateCard.cpm) return 0;
    return Math.floor((safeNumber(adDraft.budget) / adRateCard.cpm) * 1000);
  }, [adRateCard.cpm, adDraft.budget]);

  const estimatedDailySpend = useMemo(() => {
    const days = Math.max(1, Number(adDraft.durationDays || 1));
    return safeNumber(adDraft.budget) / days;
  }, [adDraft.budget, adDraft.durationDays]);

  useEffect(() => {
    if (!availableGateways.length) return;
    if (!availableGateways.some((g) => g.id === selectedGatewayId)) {
      setSelectedGatewayId(availableGateways[0].id);
    }
  }, [availableGateways, selectedGatewayId]);

  useEffect(() => {
    if (!currencyOptions.length) return;
    if (!currencyOptions.some((c) => c.code === adDraft.currency)) {
      setAdDraft((prev) => ({ ...prev, currency: currencyOptions[0].code }));
    }
  }, [currencyOptions, adDraft.currency]);

  const handlePostMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await FileService.uploadFile(file, 'community');
      setPostDraft((prev) => ({
        ...prev,
        media: [...prev.media, { id: uploaded.id, url: uploaded.url }]
      }));
      showNotification('success', 'Media', 'Media added to your post');
    } catch (error) {
      showNotification('error', 'Media', 'Upload failed');
    }
  };

  const handlePostSubmit = async () => {
    if (!postDraft.content.trim()) {
      showNotification('warning', 'Posts', 'Please add content before posting.');
      return;
    }
    setPosting(true);
    try {
      await CommunityService.createPost({
        title: postDraft.title.trim(),
        content: postDraft.content,
        attachments: postDraft.media.map((m) => m.id)
      });
      showNotification('success', 'Community', 'Post shared with the community.');
      setPostDraft({ title: '', content: '', tags: '', mentions: '', media: [] });
      loadDashboard();
    } catch (error) {
      console.error(error);
      showNotification('error', 'Community', 'Could not share your update.');
    } finally {
      setPosting(false);
    }
  };

  const handleFollowToggle = async (profile: CreatorProfile) => {
    if (!user) return;
    try {
      const endpoint = profile.following ? `/users/${profile.id}/unfollow` : `/users/${profile.id}/follow`;
      await api.post(endpoint);
      setSuggested((current) =>
        current.map((item) => (item.id === profile.id ? { ...item, following: !profile.following } : item))
      );
      setFollowers(await fetchFollowers());
      setFollowing(await fetchFollowing());
      showNotification('success', 'Social', profile.following ? 'Unfollowed' : 'Now following');
    } catch (error) {
      console.error(error);
      showNotification('error', 'Social', 'Action failed.');
    }
  };

  const handleBusinessCreate = () => {
    const newPage: BusinessPage = {
      ...emptyBusiness,
      id: `biz-${Date.now()}`,
      name: '',
      slug: '',
      followers: []
    };
    setBusinessPages((prev) => [...prev, newPage]);
    setBusiness(newPage);
    setActiveBusinessId(newPage.id || '');
  };

  const handleBusinessSwitch = (id: string) => {
    const page = businessPages.find((item) => item.id === id);
    if (page) {
      setBusiness(page);
      setActiveBusinessId(id);
    }
  };

  const handleBusinessUpdate = (updates: Partial<BusinessPage>) => {
    setBusiness((prev) => {
      const next = { ...prev, ...updates };
      setBusinessPages((current) => current.map((page) => (page.id === next.id ? next : page)));
      return next;
    });
  };

  const handleBusinessLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await FileService.uploadFile(file, 'community');
      handleBusinessUpdate({ logoUrl: uploaded.url });
      showNotification('success', 'Business Page', 'Logo uploaded.');
    } catch (error) {
      showNotification('error', 'Business Page', 'Logo upload failed.');
    }
  };

  const handleBusinessCover = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await FileService.uploadFile(file, 'community');
      handleBusinessUpdate({ coverUrl: uploaded.url });
      showNotification('success', 'Business Page', 'Cover image uploaded.');
    } catch (error) {
      showNotification('error', 'Business Page', 'Cover upload failed.');
    }
  };

  const handleBusinessFollowToggle = () => {
    if (!user) {
      showNotification('warning', 'Business Page', 'Sign in to follow business pages.');
      return;
    }
    setBusiness((prev) => {
      const followers = new Set(prev.followers || []);
      if (followers.has(user.id)) {
        followers.delete(user.id);
      } else {
        followers.add(user.id);
      }
      const updated = { ...prev, followers: Array.from(followers) };
      setBusinessPages((current) => current.map((page) => (page.id === updated.id ? updated : page)));
      localStorage.setItem(businessStorageKey, JSON.stringify(
        businessPages.map((page) => (page.id === updated.id ? updated : page))
      ));
      return updated;
    });
  };

  const handleBusinessSave = () => {
    setBusinessSaving(true);
    try {
      const withMeta = {
        ...business,
        id: business.id || user?.id || `biz-${Date.now()}`,
        slug: business.slug || toSlug(business.name || formattedUserName),
        followers: business.followers || []
      };
      const updatedList = businessPages.map((page) => (page.id === withMeta.id ? withMeta : page));
      localStorage.setItem(businessStorageKey, JSON.stringify(updatedList));
      const directoryRaw = localStorage.getItem(globalBusinessKey);
      const directory = directoryRaw ? JSON.parse(directoryRaw) : [];
      const updatedDirectory = Array.isArray(directory)
        ? [
            ...directory.filter((item: any) => item.id !== withMeta.id),
            {
              ...withMeta,
              ownerId: user?.id,
              ownerName: formattedUserName,
              updatedAt: new Date().toISOString()
            }
          ]
        : [
            {
              ...withMeta,
              ownerId: user?.id,
              ownerName: formattedUserName,
              updatedAt: new Date().toISOString()
            }
          ];
      localStorage.setItem(globalBusinessKey, JSON.stringify(updatedDirectory));
      window.dispatchEvent(new CustomEvent('community:business_pages_updated'));
      setBusiness(withMeta);
      setBusinessPages(updatedList);
      showNotification('success', 'Business Page', 'Business data saved locally.');
    } catch (error) {
      showNotification('error', 'Business Page', 'Save failed.');
    } finally {
      setBusinessSaving(false);
    }
  };

  const handleProfileSave = async () => {
    if (!user) return;
    setProfileSaving(true);
    try {
      const payload: any = {
        bio: profileBio,
        username: profileUsername
      };
      if (profilePhoto.id) {
        payload.profilePhotoFileId = profilePhoto.id;
        payload.avatar = profilePhoto.url;
      }
      const updated = await UserService.updateMyProfile(payload);
      updateUser && updateUser(updated);
      showNotification('success', 'Profile', 'Community profile updated.');
    } catch (error) {
      console.error(error);
      showNotification('error', 'Profile', 'Unable to save.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleProfilePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await FileService.uploadFile(file, 'community');
      setProfilePhoto({ id: uploaded.id, url: uploaded.url });
    } catch (error) {
      showNotification('error', 'Profile', 'Upload failed.');
    }
  };

  const handleAdSubmit = async (mode: 'draft' | 'submit' | 'pay') => {
    if (!adDraft.title.trim() || !adDraft.body.trim()) {
      showNotification('warning', 'Ads', 'Title and body are required.');
      return;
    }
    setAdActionLoading(true);
    try {
      const payload = {
        title: adDraft.title,
        body: adDraft.body,
        placement: adDraft.placement,
        budget: safeNumber(adDraft.budget),
        currency: adDraft.currency,
        targeting: {
          roles: adDraft.targetRoles,
          destinationType: adDraft.destinationType,
          targetUrl: adDraft.destinationType === 'url' ? adDraft.targetUrl : null,
          runDays: adDraft.durationDays
        },
        mediaFileIds: adDraft.media.map((m) => m.id)
      };
      const startAt = new Date();
      const durationDays = Math.max(1, Number(adDraft.durationDays || 1));
      const endAt = new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
      const draft: any = await AdService.saveCampaign({ ...payload, status: mode === 'submit' ? 'DRAFT' : undefined } as any);
      if (draft?.id) {
        await AdService.updateAd(draft.id, { startAt, endAt, targeting: payload.targeting, mediaFileIds: payload.mediaFileIds } as any);
      }
      if (mode === 'submit' && draft?.id) {
        await AdService.submitAd(draft.id);
        showNotification('success', 'Ads', 'Ad submitted for review.');
      } else if (mode === 'pay' && draft?.id) {
        if (!selectedGatewayId) {
          showNotification('warning', 'Ads', 'Select a payment method before paying.');
          setAdActionLoading(false);
          return;
        }
        setPaymentProcessingId(draft.id);
        const result = await AdService.payAd(draft.id, {
          providerId: selectedGatewayId,
          currency: adDraft.currency
        });
        if (result?.success !== false) {
          showNotification('success', 'Ads', 'Payment recorded.');
        } else {
          showNotification('error', 'Ads', result?.message || 'Payment failed.');
        }
        setPaymentProcessingId(null);
      } else {
        showNotification('success', 'Ads', 'Draft saved.');
      }
      setAdDraft((prev) => ({ ...prev }));
      loadDashboard();
    } catch (error) {
      console.error(error);
      showNotification('error', 'Ads', 'Unable to save ad.');
    } finally {
      setAdActionLoading(false);
    }
  };

  const handleSuggestedFollow = (profile: CreatorProfile) => () => handleFollowToggle(profile);

  const handleAdMediaSelected = (files: any[]) => {
    if (!Array.isArray(files) || files.length === 0) return;
    const mapped = files.map((file) => ({
      id: file.id,
      url: file.url,
      name: file.name
    }));
    setAdDraft((prev) => ({
      ...prev,
      media: [...prev.media, ...mapped]
    }));
    showNotification('success', 'Ads', 'Media added from uploaded files.');
  };

  const handleAdMediaRemove = (id: string) => {
    setAdDraft((prev) => ({
      ...prev,
      media: prev.media.filter((item) => item.id !== id)
    }));
  };

  const tabsMenu = (
    <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
            activeTab === tab.id
              ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
              : 'bg-white/70 text-slate-600 border border-slate-200 hover:border-slate-300'
          }`}
        >
          <tab.icon className="h-4 w-4" />
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );

  const renderFeed = () => (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Community Pulse</p>
          <h2 className="text-2xl font-bold text-slate-900">What everyone is sharing</h2>
        </div>
        <button
          onClick={loadDashboard}
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh Feed
        </button>
      </header>
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="space-y-3">
          <input
            value={postDraft.title}
            onChange={(e) => setPostDraft((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Optional headline"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <textarea
            value={postDraft.content}
            onChange={(e) => setPostDraft((prev) => ({ ...prev, content: e.target.value }))}
            placeholder="Share an update, ask a question, or celebrate success."
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            rows={4}
          />
          <div className="flex items-center gap-3 text-xs">
            <label className="cursor-pointer rounded-full bg-slate-100 px-3 py-1 font-semibold uppercase text-slate-600 shadow-inner">
              <Camera className="mr-1 inline h-3.5 w-3.5" />
              Add Media
              <input type="file" onChange={handlePostMedia} className="hidden" />
            </label>
            <span className="text-slate-500">#tags and @mentions supported</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {postDraft.media.map((media) => (
              <span key={media.id} className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {media.url.split('/').pop()}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span>{postDraft.tags ? `Tags: ${postDraft.tags}` : 'Add tags to surface this post in filters'}</span>
            <span>{postDraft.mentions ? `Mentions: ${postDraft.mentions}` : 'Mention teammates with @'}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Posting as {formattedUserName}</p>
          </div>
          <button
            onClick={handlePostSubmit}
            disabled={posting}
            className="rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {posting ? 'Posting...' : 'Post update'}
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {posts.map((post) => (
          <article key={post.id} className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-slate-100">
                {post.userAvatar ? (
                  <img src={post.userAvatar} alt={post.userName} className="h-full w-full rounded-2xl object-cover" />
                ) : (
                  <Users className="mx-auto mt-2 h-6 w-6 text-slate-400" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{post.userName}</p>
                <p className="text-xs text-slate-500">
                  {post.createdAt ? new Date(post.createdAt).toLocaleString() : 'Just now'}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {post.title && <h3 className="text-lg font-semibold text-slate-900">{post.title}</h3>}
              <p className="text-sm text-slate-700">{post.content}</p>
              {post.tags?.length ? (
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {post.attachments?.length ? (
                <div className="mt-2 grid gap-2">
                  {post.attachments.map((media) => (
                    <div key={media.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                      Attached:{' '}
                      <a href={media.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                        {media.url.split('/').pop()}
                      </a>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-slate-500">
              <button className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                Repost
              </button>
              <button className="flex items-center gap-1">
                <Share2 className="h-3 w-3" />
                Share
              </button>
              <button className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                View
              </button>
            </div>
          </article>
          ))}
        </div>
      </section>
  );

  const renderAds = () => (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Ads & Sponsorships</p>
          <h2 className="text-2xl font-bold text-slate-900">Ad management studio</h2>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-600">
            Active ads: {ads.filter((ad) => ad.status?.toLowerCase() === 'active').length}
          </p>
          <p className="text-xs text-slate-400">Submit for admin review to go live.</p>
        </div>
      </header>
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={adDraft.title}
            onChange={(e) => setAdDraft((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Ad title"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <input
            value={adDraft.targetUrl}
            onChange={(e) => setAdDraft((prev) => ({ ...prev, targetUrl: e.target.value }))}
            placeholder="Target URL"
            disabled={adDraft.destinationType === 'messages'}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <textarea
          value={adDraft.body}
          onChange={(e) => setAdDraft((prev) => ({ ...prev, body: e.target.value }))}
          placeholder="Describe your campaign or creative idea."
          className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          rows={3}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <button
            onClick={() => setShowAdMediaPicker(true)}
            className="rounded-full bg-slate-100 px-3 py-1 font-semibold uppercase text-slate-600 shadow-inner"
          >
            Add images or video
          </button>
          <span className="text-slate-500">Select from Uploaded Files or upload new.</span>
        </div>
        {adDraft.media.length > 0 && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {adDraft.media.map((media) => (
              <div
                key={media.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
              >
                <span>Uploaded: {media.name || media.url.split('/').pop()}</span>
                <button onClick={() => handleAdMediaRemove(media.id)} className="text-xs font-semibold text-red-500">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <select
            value={adDraft.placement}
            onChange={(e) => setAdDraft((prev) => ({ ...prev, placement: e.target.value as any }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="feed">Feed spotlight</option>
            <option value="sidebar">Sidebar card</option>
            <option value="forum_top">Forum highlight</option>
          </select>
          <input
            type="number"
            value={adDraft.budget}
            onChange={(e) => setAdDraft((prev) => ({ ...prev, budget: Number(e.target.value) }))}
            placeholder="Budget (USD)"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <select
            value={adDraft.currency}
            onChange={(e) => setAdDraft((prev) => ({ ...prev, currency: e.target.value }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          >
            {currencyOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            type="number"
            min={1}
            value={adDraft.durationDays}
            onChange={(e) => setAdDraft((prev) => ({ ...prev, durationDays: Number(e.target.value || 1) }))}
            placeholder="Duration (days)"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <select
            value={adDraft.destinationType}
            onChange={(e) => setAdDraft((prev) => ({ ...prev, destinationType: e.target.value as 'url' | 'messages' }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="url">Send users to URL</option>
            <option value="messages">Receive messages instead</option>
          </select>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            {adDraft.destinationType === 'messages'
              ? 'Users will message you directly from the ad.'
              : 'Users will be sent to the target URL.'}
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Available methods update from your configured payment gateways.
          </div>
          <select
            value={selectedGatewayId}
            onChange={(e) => setSelectedGatewayId(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          >
            {availableGateways.length === 0 ? (
              <option value="">No payment methods available</option>
            ) : (
              availableGateways.map((gateway) => (
                <option key={gateway.id} value={gateway.id}>
                  {gateway.name || gateway.label || gateway.id}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {['freelancer', 'employer'].map((role) => (
            <button
              key={role}
              onClick={() =>
                setAdDraft((prev) => ({
                  ...prev,
                  targetRoles: prev.targetRoles.includes(role)
                    ? prev.targetRoles.filter((r) => r !== role)
                    : [...prev.targetRoles, role]
                }))
              }
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                adDraft.targetRoles.includes(role)
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {role}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleAdSubmit('draft')}
            disabled={adActionLoading}
            className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Save draft
          </button>
          <button
            onClick={() => handleAdSubmit('submit')}
            disabled={adActionLoading}
            className="rounded-2xl bg-gradient-to-r from-indigo-500 to-sky-600 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white"
          >
            Submit for review
          </button>
          <button
            onClick={() => handleAdSubmit('pay')}
            disabled={adActionLoading}
            className="rounded-2xl bg-slate-900 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white"
          >
            {paymentProcessingId ? 'Processing payment...' : 'Pay now'}
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {ads.map((ad) => (
          <div key={ad.id} className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{ad.title || 'Untitled Ad'}</p>
                <p className="text-xs text-slate-500">{ad.body}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{ad.status}</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="text-xs text-slate-500">Placement: {ad.placement}</div>
              <div className="text-xs text-slate-500">Budget: {ad.budget ?? ad.pendingBudget ?? 0} {ad.currency || 'USD'}</div>
              <div className="text-xs text-slate-500">Spent: {(Number(ad.budget || 0) - Number(ad.remainingBudget || 0)).toFixed(2)} {ad.currency || 'USD'}</div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div className="text-xs text-slate-500">Clicks: {ad.clicks ?? 0}</div>
              <div className="text-xs text-slate-500">Views: {ad.impressions ?? 0}</div>
              <div className="text-xs text-slate-500">Impressions: {ad.impressions ?? 0}</div>
              <div className="text-xs text-slate-500">Likes: {(ad as any).likes ?? 0}</div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="text-xs text-slate-500">
                Run: {ad.startAt ? new Date(ad.startAt).toLocaleDateString() : '—'} → {ad.endAt ? new Date(ad.endAt).toLocaleDateString() : '—'}
              </div>
              <div className="text-xs text-slate-500">
                Destination: {(ad as any)?.targeting?.destinationType === 'messages' ? 'Messages' : 'URL'}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
              <button className="text-blue-600">View stats</button>
              <button className="text-blue-600">Edit creative</button>
              <button className="text-blue-600">Share</button>
            </div>
          </div>
        ))}
      </div>
      <FilePickerModal
        open={showAdMediaPicker}
        onClose={() => setShowAdMediaPicker(false)}
        onSelect={(file) => handleAdMediaSelected([file])}
        onSelectMultiple={(files) => handleAdMediaSelected(files)}
        allowUpload={true}
        multiple={true}
        filterType="all"
        acceptedTypes={['image', 'video']}
        title="Select ad images or video"
        role={user?.role}
        visibility="public"
      />
    </section>
  );

  const renderInsights = () => (
    <section className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-slate-500">Community insights</p>
        <h2 className="text-2xl font-bold text-slate-900">Health, revenue, and trust</h2>
      </header>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Gcoins earned', value: insights.gcoin, icon: ShieldCheck },
          { label: 'Earnings', value: `$${insights.earnings.toFixed(2)}`, icon: CreditCard },
          { label: 'Followers', value: insights.followers, icon: Users },
          { label: 'Active campaigns', value: insights.activeAds, icon: Megaphone }
        ].map((card) => (
          <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <card.icon className="h-6 w-6 text-slate-500" />
              <p className="text-xs uppercase tracking-wide text-slate-400">{card.label}</p>
            </div>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Engagement trend</h3>
        <p className="mt-2 text-xs text-slate-500">
          Real-time community data, ad clicks, and AI moderation flags.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-slate-900 p-4 text-white">
            <p className="text-xs uppercase tracking-widest">Satisfaction</p>
            <p className="text-2xl font-bold">92%</p>
            <p className="text-xs text-white/80">Positive sentiment</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-900 p-4 text-white">
            <p className="text-xs uppercase tracking-widest">Trends</p>
            <p className="text-2xl font-bold">+18%</p>
            <p className="text-xs text-white/80">Week over week</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-rose-700 p-4 text-white">
            <p className="text-xs uppercase tracking-widest">Signals</p>
            <p className="text-2xl font-bold">{insights.engagement}%</p>
            <p className="text-xs text-white/80">Community response</p>
          </div>
        </div>
      </div>
    </section>
  );

  const renderProfile = () => (
    <section className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-slate-500">Community profile</p>
        <h2 className="text-2xl font-bold text-slate-900">Personalize your presence</h2>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="mb-2 block text-xs font-semibold text-slate-500">Profile photo</label>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 overflow-hidden rounded-2xl bg-slate-100">
              {profilePhoto.url ? (
                <img src={profilePhoto.url} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <UserCircle className="mx-auto mt-3 h-10 w-10 text-slate-400" />
              )}
            </div>
            <label className="cursor-pointer rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Upload photo
              <input type="file" accept="image/*" onChange={handleProfilePhoto} className="hidden" />
            </label>
          </div>
          <div className="mt-4 space-y-3">
            <input
              value={profileUsername}
              onChange={(e) => setProfileUsername(e.target.value)}
              placeholder="Community username"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            />
            <textarea
              value={profileBio}
              onChange={(e) => setProfileBio(e.target.value)}
              placeholder="Share a short bio that appears on your community profile."
              rows={3}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            onClick={handleProfileSave}
            disabled={profileSaving}
            className="mt-4 w-full rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white shadow-lg"
          >
            {profileSaving ? 'Saving...' : 'Save profile'}
          </button>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Bio snapshot</h3>
          <p className="text-sm text-slate-500">
            {profileBio || 'Add a biography to tell people what you stand for.'}
          </p>
          <div className="grid gap-2">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
              <span>Reputation</span>
              <span>Professional</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
              <span>Signals</span>
              <span>Responsive</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  const renderNetwork = () => (
    <section className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-slate-500">Community network</p>
        <h2 className="text-2xl font-bold text-slate-900">Connect, follow, and co-create</h2>
      </header>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Followers</p>
          <div className="mt-3 space-y-3">
            {followers.slice(0, 4).map((profile) => (
              <div key={profile.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-100">
                    {profile.avatar ? (
                      <img src={profile.avatar} alt={profile.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <Users className="mx-auto mt-2 h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{profile.name}</p>
                    <p className="text-xs text-slate-500">Followers: {profile.followersCount}</p>
                  </div>
                </div>
                <button className="text-xs font-semibold text-slate-600">View</button>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Following</p>
          <div className="mt-3 space-y-3">
            {following.slice(0, 4).map((profile) => (
              <div key={profile.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-100">
                    {profile.avatar ? (
                      <img src={profile.avatar} alt={profile.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <Users className="mx-auto mt-2 h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{profile.name}</p>
                    <p className="text-xs text-slate-500">Following: {profile.followingCount}</p>
                  </div>
                </div>
                <button onClick={() => handleFollowToggle(profile)} className="text-xs font-semibold text-blue-600">
                  Unfollow
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Suggested creators</p>
          <div className="mt-3 space-y-3">
            {suggested.map((profile) => (
              <div key={profile.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-100">
                    {profile.avatar ? (
                      <img src={profile.avatar} alt={profile.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <Users className="mx-auto mt-2 h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{profile.name}</p>
                    <p className="text-xs text-slate-500">Followers: {profile.followersCount}</p>
                  </div>
                </div>
                <button
                  onClick={handleSuggestedFollow(profile)}
                  className={`text-xs font-semibold ${profile.following ? 'text-slate-500' : 'text-blue-600'}`}
                >
                  {profile.following ? 'Following' : 'Follow'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  const renderBusiness = () => (
    <section className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-slate-500">Business presence</p>
        <h2 className="text-2xl font-bold text-slate-900">Compose your storefront</h2>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={activeBusinessId}
          onChange={(e) => handleBusinessSwitch(e.target.value)}
          className="rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {businessPages.map((page) => (
            <option key={page.id} value={page.id}>
              {page.name || 'Untitled business'} ({page.slug || 'draft'})
            </option>
          ))}
        </select>
        <button
          onClick={handleBusinessCreate}
          className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
        >
          Add new business page
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="rounded-2xl border border-dashed border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Brand assets</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Logo</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-14 w-14 rounded-2xl bg-slate-100 overflow-hidden">
                    {business.logoUrl ? (
                      <img src={business.logoUrl} alt="Logo" className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className="mx-auto mt-4 h-6 w-6 text-slate-400" />
                    )}
                  </div>
                  <label className="cursor-pointer rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    Upload logo
                    <input type="file" accept="image/*" onChange={handleBusinessLogo} className="hidden" />
                  </label>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Cover image</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-14 flex-1 rounded-2xl bg-slate-100 overflow-hidden">
                    {business.coverUrl ? (
                      <img src={business.coverUrl} alt="Cover" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">No cover</div>
                    )}
                  </div>
                  <label className="cursor-pointer rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    Upload cover
                    <input type="file" accept="image/*" onChange={handleBusinessCover} className="hidden" />
                  </label>
                </div>
              </div>
            </div>
          </div>
          <input
            value={business.name}
            onChange={(e) => handleBusinessUpdate({ name: e.target.value })}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Business name"
          />
          <input
            value={business.slug}
            onChange={(e) => handleBusinessUpdate({ slug: toSlug(e.target.value) })}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Geezle address (e.g. arewa-express)"
          />
          <p className="text-xs text-slate-400">
            Your Geezle address: geezle.com/company/{business.slug || toSlug(business.name || '') || 'your-business'}
          </p>
          <input
            value={business.tagline}
            onChange={(e) => handleBusinessUpdate({ tagline: e.target.value })}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Tagline"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={business.industry}
              onChange={(e) => handleBusinessUpdate({ industry: e.target.value })}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Industry</option>
              {industryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={business.orgSize}
              onChange={(e) => handleBusinessUpdate({ orgSize: e.target.value })}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Organization size</option>
              {organizationSizes.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={business.orgType}
              onChange={(e) => handleBusinessUpdate({ orgType: e.target.value })}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Organization type</option>
              {organizationTypes.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              value={business.category}
              onChange={(e) => handleBusinessUpdate({ category: e.target.value })}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Primary focus"
            />
          </div>
          <input
            value={business.website}
            onChange={(e) => handleBusinessUpdate({ website: e.target.value })}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Website"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={business.email}
              onChange={(e) => handleBusinessUpdate({ email: e.target.value })}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Public email"
            />
            <input
              value={business.phone}
              onChange={(e) => handleBusinessUpdate({ phone: e.target.value })}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Public phone"
            />
          </div>
          <input
            value={business.location}
            onChange={(e) => handleBusinessUpdate({ location: e.target.value })}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Location"
          />
          <textarea
            value={business.description}
            onChange={(e) => handleBusinessUpdate({ description: e.target.value })}
            placeholder="Describe your business, offerings, and differentiators."
            className="h-32 rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p className="text-xs text-slate-400">Google-enabled tools make it easier to surface your page.</p>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={business.googleBusinessEnabled}
              onChange={(e) => setBusiness((prev) => ({ ...prev, googleBusinessEnabled: e.target.checked }))}
              className="h-4 w-4 rounded border"
            />
            Enable Google Business sync
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={business.googlePlaceId}
              onChange={(e) => setBusiness((prev) => ({ ...prev, googlePlaceId: e.target.value }))}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Google Place ID"
            />
            <input
              value={business.googleAnalyticsId}
              onChange={(e) => setBusiness((prev) => ({ ...prev, googleAnalyticsId: e.target.value }))}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Google Analytics ID"
            />
          </div>
          <button
            onClick={handleBusinessSave}
            disabled={businessSaving}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-blue-500 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white shadow-lg"
          >
            {businessSaving ? 'Saving...' : 'Save business profile'}
          </button>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-900 to-slate-800 p-5 text-white shadow-xl">
          <h3 className="text-lg font-semibold text-white">Preview</h3>
          <p className="mt-2 text-sm text-slate-200">
            Google maps, ads, and followers will reference this information.
          </p>
          <div className="mt-5 space-y-3 rounded-2xl bg-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-white/20 overflow-hidden">
                {business.logoUrl ? (
                  <img src={business.logoUrl} alt="Logo" className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="mx-auto mt-3 h-6 w-6 text-white/70" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold">{business.name || 'Your business name'}</p>
                <p className="text-xs text-slate-200">@{business.slug || 'your-business'}</p>
              </div>
            </div>
            <p className="text-xs text-slate-200">{business.tagline || 'Tell your audience why you exist.'}</p>
            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-slate-300">
              <span>{business.industry || 'Industry'}</span>
              <span>{business.orgSize || 'Size'}</span>
              <span>{business.orgType || 'Type'}</span>
            </div>
            <p className="text-xs text-slate-200">
              {business.description || 'A complete history of your offerings stays here.'}
            </p>
            <div className="flex flex-wrap gap-3 text-xs text-slate-200">
              <span>Followers: {business.followers?.length || 0}</span>
              <span>Website: {business.website || '—'}</span>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-slate-300">
              <span>Tag: #{business.slug || 'geezle'}</span>
              <span>Mention: @{business.slug || 'geezle'}</span>
            </div>
            <button
              onClick={handleBusinessFollowToggle}
              className="mt-2 w-full rounded-2xl bg-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
            >
              {business.followers?.includes(user?.id || '') ? 'Unfollow page' : 'Follow page'}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            CPM: {adRateCard.cpm || 0} {adDraft.currency}
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            CPC: {adRateCard.cpc || 0} {adDraft.currency}
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Est. impressions: {estimatedImpressions.toLocaleString()}
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Est. daily spend: {estimatedDailySpend.toFixed(2)} {adDraft.currency}
          </div>
        </div>
      </div>
    </section>
  );

  const renderContent = () => {
    if (!user) return <p className="text-center text-slate-500">Sign in to access the community dashboard.</p>;
    switch (activeTab) {
      case 'ads':
        return renderAds();
      case 'business':
        return renderBusiness();
      case 'network':
        return renderNetwork();
      case 'profile':
        return renderProfile();
      case 'insights':
        return renderInsights();
      default:
        return renderFeed();
    }
  };

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] bg-gradient-to-r from-slate-900 via-slate-900 to-purple-900 p-6 text-white shadow-2xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.5em] text-slate-300">Community Hub</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Welcome back, {formattedUserName}</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-200">
              Share stories, launch ads, and grow your brand with a single control center. Everything you need to stay visible
              and trusted is right here.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white shadow-inner">
            <ShieldCheck className="h-5 w-5" />
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-200">Verified</p>
              <p className="text-sm font-semibold">Premium community creator</p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
            <p className="text-xs text-slate-300">Gcoins</p>
            <p className="text-2xl font-semibold">{insights.gcoin}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
            <p className="text-xs text-slate-300">Followers</p>
            <p className="text-2xl font-semibold">{insights.followers}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
            <p className="text-xs text-slate-300">Active ads</p>
            <p className="text-2xl font-semibold">{insights.activeAds}</p>
          </div>
        </div>
      </section>
      <section>{tabsMenu}</section>
      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white/80 p-10 text-center text-slate-500 shadow-sm">
          Loading your workspace...
        </div>
      ) : (
        renderContent()
      )}
    </main>
  );
};

export default CommunityDashboard;

