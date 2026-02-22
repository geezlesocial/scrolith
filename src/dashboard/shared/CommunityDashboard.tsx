import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  Camera,
  CreditCard,
  Eye,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Share2,
  ShieldCheck,
  UserCircle,
  Users
} from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { CommunityService } from '../../services/community';
import { AdService } from '../../services/ads';
import { FileService } from '../../services/files';
import { UserService } from '../../services/user';
import { PaymentService } from '../../services/payment';
import { GcoinService } from '../../services/gcoin';
import { useCurrency } from '../../context/CurrencyContext';
import { AdCampaign, PaymentGateway, UploadedFile } from '../../types';
import { getDefaultStoryTextDraft, getStoryTextStyle, storyTextFonts, storyTextThemes } from '../../community/storyStyles';
import MentionText from '../../community/components/MentionText';
import MentionHashtagTextarea from '../../community/components/MentionHashtagTextarea';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { getUserFacingPaymentMethodName } from '../../utils/paymentGatewayDisplay';
import FilePickerModal from './FilePickerModal';
import MonetizationPanel from './MonetizationPanel';

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'posts', label: 'Posts', icon: Share2 },
  { id: 'followers', label: 'Followers', icon: Users },
  { id: 'gcoin', label: 'Gcoin', icon: CreditCard },
  { id: 'earnings', label: 'Earnings', icon: BarChart3 },
  { id: 'ads', label: 'Ads Manager', icon: Megaphone },
  { id: 'business', label: 'Business Pages', icon: Building2 },
  { id: 'stories', label: 'Stories', icon: Camera },
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'settings', label: 'Settings', icon: UserCircle }
] as const;

type TabId = typeof tabs[number]['id'];
const isTabId = (value: string): value is TabId => tabs.some((tab) => tab.id === value);

type CreatorProfile = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  bio?: string;
  followersCount?: number;
  followingCount?: number;
  following?: boolean;
  followId?: string;
  isBlocked?: boolean;
  followedAt?: string;
};

type BusinessPage = {
  id?: string;
  name: string;
  handle: string;
  slug: string;
  tagline?: string;
  category?: string;
  industry?: string;
  orgSize?: string;
  orgType?: string;
  website?: string;
  email?: string;
  phone?: string;
  location?: string;
  description?: string;
  logoFileId?: string;
  coverFileId?: string;
  logo?: { id?: string; url?: string };
  cover?: { id?: string; url?: string };
  followersCount?: number;
  followId?: string;
  isFollowing?: boolean;
  status?: string;
  statusReason?: string;
  statusUpdatedAt?: string | null;
};

type CommunityPost = {
  id: string;
  authorId?: string;
  authorUserId?: string;
  title?: string;
  content?: string;
  attachments?: { url: string; id: string; name?: string; type?: 'image' | 'video' | 'document'; mimeType?: string }[];
  author?: {
    id?: string;
    username?: string | null;
    displayName?: string;
    avatarUrl?: string;
    type?: string;
    businessSlug?: string | null;
    isVerified?: boolean;
    isPro?: boolean;
  };
  viewer?: {
    isFollowingAuthor?: boolean;
  };
  authorUsername?: string;
  userName?: string;
  userAvatar?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  mentions?: string[];
  topic?: string | null;
  location?: string | null;
  visibility?: string;
  commentPolicy?: string | null;
  isPinned?: boolean;
  isHighlighted?: boolean;
  originalPostId?: string | null;
  originalPost?: {
    id?: string;
    authorName?: string;
  } | null;
  interactions?: { likes?: number; comments?: number; shares?: number; reposts?: number };
  userState?: { liked?: boolean; reposted?: boolean; reaction?: string | null };
};

type PostMediaItem = {
  localId: string;
  id?: string;
  url: string;
  name?: string;
  type?: 'image' | 'video' | 'document';
  progress?: number;
  uploading?: boolean;
  error?: string;
  previewUrl?: string;
};

type PostDraft = {
  title: string;
  content: string;
  tags: string;
  mentions: string;
  topic: string;
  location: string;
  media: PostMediaItem[];
  visibility: 'public' | 'friends' | 'network' | 'private' | 'custom';
};

const inferMediaType = (media: { url?: string; mimeType?: string; type?: string }) => {
  const explicit = String(media.type || '').toLowerCase();
  if (explicit === 'image' || explicit === 'video' || explicit === 'document') return explicit;
  const mime = String(media.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  const url = String(media.url || '').toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogg)$/.test(url)) return 'video';
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(url)) return 'image';
  return 'document';
};

const emptyBusiness: BusinessPage = {
  id: '',
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
  logo: undefined,
  cover: undefined,
  followersCount: 0,
  status: 'active'
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

const topicOptions = [
  'Product',
  'Design',
  'Engineering',
  'Marketing',
  'Sales',
  'Operations',
  'Finance',
  'Leadership',
  'Community',
  'Hiring',
  'Events',
  'Startups',
  'Freelancing',
  'Remote Work'
];

const organizationSizes = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

const organizationTypes = ['Company', 'Agency', 'Studio', 'Non-profit', 'Public institution', 'Community group'];

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 60);

const buildProfileUrl = (profile?: { username?: string; id?: string }) => {
  const handle = String(profile?.username || '').trim().replace(/^@+/, '');
  if (handle) return `/u/${handle}`;
  const id = String(profile?.id || '').trim();
  return id ? `/profile/${id}` : '/profile/edit';
};

const CommunityDashboard: React.FC = () => {
  const { user, updateUser } = useUser();
  const { showNotification } = useNotification();
  const { isConnected } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const createPageRequestRef = useRef('');
  const { availableCurrencies } = useCurrency();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [myPosts, setMyPosts] = useState<CommunityPost[]>([]);
  const [feedView, setFeedView] = useState<'all' | 'discover' | 'following'>('all');
  const [feedTopic, setFeedTopic] = useState('');
  const [feedRegion, setFeedRegion] = useState('');
  const [feedLoading, setFeedLoading] = useState(false);
  const [postActionBusy, setPostActionBusy] = useState<Record<string, boolean>>({});
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostDraft, setEditingPostDraft] = useState<{
    title: string;
    content: string;
    tags: string;
    mentions: string;
    topic: string;
    location: string;
    visibility: PostDraft['visibility'];
  } | null>(null);
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [stories, setStories] = useState<any[]>([]);
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
  const [gcoinWallet, setGcoinWallet] = useState<any>(null);
  const [business, setBusiness] = useState<BusinessPage>(emptyBusiness);
  const [businessPages, setBusinessPages] = useState<BusinessPage[]>([]);
  const [businessConfig, setBusinessConfig] = useState<{
    businessPagesEnabled: boolean;
    businessPageUserCreationEnabled: boolean;
    businessPagePostingEnabled: boolean;
    businessPageFollowEnabled: boolean;
  }>({
    businessPagesEnabled: true,
    businessPageUserCreationEnabled: true,
    businessPagePostingEnabled: true,
    businessPageFollowEnabled: true
  });
  const [activeBusinessId, setActiveBusinessId] = useState<string>('');
  const [businessSaving, setBusinessSaving] = useState(false);
  const [businessFollowBusy, setBusinessFollowBusy] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [selectedGatewayId, setSelectedGatewayId] = useState('');
  const [showPostMediaPicker, setShowPostMediaPicker] = useState(false);
  const [showAdMediaPicker, setShowAdMediaPicker] = useState(false);
  const [showStoryMediaPicker, setShowStoryMediaPicker] = useState(false);
  const [assetPickerTarget, setAssetPickerTarget] = useState<'profile' | 'business-logo' | 'business-cover' | null>(null);
  const [adsConfig, setAdsConfig] = useState<any>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [replaceMediaId, setReplaceMediaId] = useState<string | null>(null);
  const [postDraft, setPostDraft] = useState<PostDraft>({
    title: '',
    content: '',
    tags: '',
    mentions: '',
    topic: '',
    location: '',
    media: [],
    visibility: 'public'
  });
  const [posting, setPosting] = useState(false);
  const [storyDraft, setStoryDraft] = useState<{
    type: 'text' | 'image' | 'video';
    content: string;
    visibility: 'public' | 'friends' | 'network' | 'private' | 'custom';
    media?: UploadedFile | null;
    textBackground: string;
    textColor: string;
    textFont: string;
    textAlign: 'left' | 'center' | 'right';
  }>(() => ({
    type: 'text',
    content: '',
    visibility: 'public',
    media: null,
    ...getDefaultStoryTextDraft()
  }));
  const [storyPosting, setStoryPosting] = useState(false);
  const storyPreviewStyle = getStoryTextStyle(storyDraft);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileBio, setProfileBio] = useState('');
  const [profileUsername, setProfileUsername] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<{ id?: string; url?: string }>({});
    const [adDraft, setAdDraft] = useState({
      title: '',
      body: '',
      objective: 'traffic' as 'traffic' | 'messages',
      placement: 'community_feed',
      placements: ['community_feed'] as string[],
      pricingModel: 'CPM' as 'CPM' | 'CPC',
      targetCountries: '' as string,
      targetAudience: 'users' as 'users' | 'businesses' | 'all',
      dailySpend: 0,
      budget: 120,
      currency: 'USD',
      destinationUrl: '',
      ctaText: '',
      media: [] as { id: string; url: string; name?: string; type?: string; mimeType?: string }[],
      durationDays: 7,
      destinationType: 'url' as 'url' | 'messages'
    });
  const [adActionLoading, setAdActionLoading] = useState(false);
  const [paymentProcessingId, setPaymentProcessingId] = useState<string | null>(null);
  const [networkActionBusy, setNetworkActionBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const section = new URLSearchParams(location.search).get('section');
    if (section && isTabId(section)) {
      setActiveTab(section);
    }
  }, [location.search]);

  const formattedUserName = `${user?.name || user?.username || 'Community member'}`;
  const hasPostUploads = postDraft.media.some((item) => item.uploading);
    const normalizePost = useCallback((post: any): CommunityPost => ({
      id: post.id || `${post.userId || post.user_id}-${Date.now()}`,
      authorId: post.authorId || post.author?.id || post.userId || post.user_id,
      authorUserId:
        post.authorUserId ||
        post.author_user_id ||
        post.author?.userId ||
        post.author?.user_id ||
        (String(post.author?.type || '').toLowerCase() === 'user'
          ? (post.authorId || post.author?.id || post.userId || post.user_id)
          : undefined),
      title: post.title,
      content: post.content,
      attachments: (post.attachments || []).map((item: any) => ({
        id: item.id || item.fileId || item,
        url: item.url || item,
        name: item.name || item.originalName || item.filename,
        mimeType: item.mimeType || item.mime_type,
        type: item.type || inferMediaType(item)
      })),
      author: post.author
        ? {
            id: post.author.id,
            username: post.author.username,
            displayName: post.author.displayName || post.author.name || post.authorName || formattedUserName,
            avatarUrl: post.author.avatarUrl || post.author.avatar || post.authorAvatar || post.userAvatar,
            type: post.author.type,
            businessSlug: post.author.businessSlug,
            isVerified: Boolean(post.author.isVerified),
            isPro: Boolean(post.author.isPro)
          }
        : undefined,
      viewer: post.viewer
        ? {
            isFollowingAuthor: Boolean(post.viewer.isFollowingAuthor)
          }
        : undefined,
      authorUsername: post.authorUsername || post.author?.username,
      userName: post.authorName || post.userName || post.user_name || formattedUserName,
      userAvatar: post.authorAvatar || post.userAvatar || post.user_avatar,
      createdAt: post.createdAt || post.created_at,
      updatedAt: post.updatedAt || post.updated_at,
      tags: post.tags || [],
      mentions: post.mentions || [],
      topic: post.topic || null,
      location: post.location || null,
      visibility: post.visibility || 'public',
      commentPolicy: post.commentPolicy || null,
      isPinned: Boolean(post.isPinned || post.is_pinned),
      isHighlighted: Boolean(post.isHighlighted || post.is_highlighted),
      originalPostId: post.originalPostId || post.original_post_id || null,
      originalPost: post.originalPost
        ? {
            id: post.originalPost.id,
            authorName: post.originalPost.authorName
          }
        : null,
      interactions: {
        likes: Number(post.interactions?.likes ?? post.likesCount ?? 0),
        comments: Number(post.interactions?.comments ?? 0),
        shares: Number(post.interactions?.shares ?? post.sharesCount ?? 0),
        reposts: Number(post.interactions?.reposts ?? post.repostsCount ?? 0)
      },
      userState: {
        liked: Boolean(post.userState?.liked),
        reposted: Boolean(post.userState?.reposted),
        reaction: post.userState?.reaction ?? null
      }
    }), [formattedUserName]);

  const resolvePostOwnerUserId = useCallback((post: CommunityPost) => {
    const explicit = String(post.authorUserId || '').trim();
    if (explicit) return explicit;
    const authorType = String(post.author?.type || '').toLowerCase();
    if (authorType === 'user') return String(post.authorId || post.author?.id || '').trim();
    return '';
  }, []);

  const normalizeCreator = (payload: any): CreatorProfile => {
    const userPayload = payload?.user || payload;
    return {
      id: userPayload?.id || userPayload?.userId || userPayload?.user_id || '',
      name: userPayload?.name || userPayload?.fullName || userPayload?.user_name || userPayload?.email || 'Community member',
      username: userPayload?.username || userPayload?.handle,
      avatar: userPayload?.avatar || userPayload?.user_avatar || userPayload?.userAvatar,
      bio: userPayload?.bio || userPayload?.tagline,
      followersCount: Number(
        userPayload?.followersCount ??
        userPayload?.followers_count ??
        payload?.followersCount ??
        payload?.followers_count ??
        0
      ),
      followingCount: Number(
        userPayload?.followingCount ??
        userPayload?.following_count ??
        payload?.followingCount ??
        payload?.following_count ??
        0
      ),
      following: Boolean(payload?.following ?? payload?.isFollowing),
      followId: payload?.followId || payload?.follow_id,
      isBlocked: Boolean(payload?.isBlocked ?? payload?.is_blocked),
      followedAt: payload?.followedAt || payload?.followed_at
    };
  };

  const fetchFollowers = useCallback(async () => {
    if (!user) return [];
    try {
      const data = await CommunityService.listMyFollowers({ limit: 50 });
      const items = Array.isArray(data?.items) ? data.items : [];
      return items.map(normalizeCreator);
    } catch (error) {
      console.warn('followers error', error);
      return [];
    }
  }, [user]);

  const fetchFollowing = useCallback(async () => {
    if (!user) return [];
    try {
      const data = await CommunityService.listMyFollowing({ limit: 50 });
      const items = Array.isArray(data?.items) ? data.items : [];
      return items.map(normalizeCreator);
    } catch (error) {
      console.warn('following error', error);
      return [];
    }
  }, [user]);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        CommunityService.getFeed({ limit: 12, scope: 'public' }),
        AdService.getMyAds(),
        CommunityService.getTopContributors(6),
        CommunityService.getAnalytics(),
        fetchFollowers(),
        fetchFollowing(),
        AdService.getConfig(),
        CommunityService.getMyBusinessPages(),
        CommunityService.getBusinessPagesConfig(),
        CommunityService.getStoriesFeed(),
        user?.id ? GcoinService.getWallet(user.id, user.email) : Promise.resolve(null)
      ]);

      const pick = <T,>(index: number, fallback: T): T => {
        const result = results[index];
        if (result && result.status === 'fulfilled') return result.value as T;
        console.warn('Community dashboard call failed', index, result);
        return fallback;
      };

      const feedData = pick<any>(0, []);
      const adData = pick<AdCampaign[]>(1, []);
      const topCreators = pick<any[]>(2, []);
      const analytics = pick<any>(3, {});
      const followersData = pick<CreatorProfile[]>(4, []);
      const followingData = pick<CreatorProfile[]>(5, []);
      const adConfig = pick<any>(6, null);
      const pagesData = pick<any[]>(7, []);
      const pageConfig = pick<any>(8, null);
      const storiesData = pick<any[]>(9, []);
      const wallet = pick<any>(10, null);
      const feedItems = Array.isArray(feedData?.items) ? feedData.items : (Array.isArray(feedData) ? feedData : []);
      setPosts(feedItems.slice(0, 12).map(normalizePost));
      setAds(adData);
      setSuggested(topCreators.map(normalizeCreator));
      setInsights((prev) => ({
        gcoin: wallet?.balance ?? analytics?.gcoin ?? prev.gcoin,
        earnings: wallet?.lifetimeEarned ?? analytics?.earnings ?? analytics?.revenue ?? prev.earnings,
        followers: followersData.length ?? analytics?.followers ?? prev.followers,
        activeAds: adData.filter((ad) => ad.status?.toLowerCase() === 'active').length,
        engagement: analytics?.engagementScore ?? prev.engagement
      }));
      setFollowers(followersData);
      setFollowing(followingData);
      setAdsConfig(adConfig || null);
      if (pageConfig && typeof pageConfig === 'object') {
        setBusinessConfig({
          businessPagesEnabled: pageConfig.businessPagesEnabled !== false,
          businessPageUserCreationEnabled: pageConfig.businessPageUserCreationEnabled !== false,
          businessPagePostingEnabled: pageConfig.businessPagePostingEnabled !== false,
          businessPageFollowEnabled: pageConfig.businessPageFollowEnabled !== false
        });
      }
      const normalizedPages = Array.isArray(pagesData) ? pagesData.map((page: any) => ({
        ...emptyBusiness,
        ...page,
        id: page.id,
        name: page.name,
        handle: page.handle || page.username || page.slug || '',
        slug: page.slug || toSlug(page.name || formattedUserName),
        logoFileId: page.logoFileId || page.logo?.id,
        coverFileId: page.coverFileId || page.cover?.id,
        logo: page.logo || (page.logoFileId ? { id: page.logoFileId, url: page.logoUrl } : undefined),
        cover: page.cover || (page.coverFileId ? { id: page.coverFileId, url: page.coverUrl } : undefined),
        followersCount: page.followersCount ?? 0,
        status: (page.status || 'active').toLowerCase(),
        statusReason: page.statusReason || '',
        statusUpdatedAt: page.statusUpdatedAt || null
      })) : [];
      setBusinessPages(normalizedPages);
      if (normalizedPages.length) {
        setBusiness(normalizedPages[0]);
        setActiveBusinessId(normalizedPages[0].id || '');
      } else {
        setBusiness({ ...emptyBusiness, name: formattedUserName, handle: toSlug(formattedUserName), slug: toSlug(formattedUserName) });
        setActiveBusinessId('');
      }
      setStories(Array.isArray(storiesData) ? storiesData : []);
      setGcoinWallet(wallet);
      try {
        const gateways = await PaymentService.getActivePaymentMethods();
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
      showNotification('error', 'Community', 'Unable to load some community modules.');
    } finally {
      setLoading(false);
    }
  }, [user, formattedUserName, fetchFollowers, fetchFollowing, showNotification, selectedGatewayId, normalizePost]);

  const loadFeed = useCallback(async () => {
    try {
      setFeedLoading(true);
      const scope = feedView === 'all' ? 'public' : feedView;
      const feedData = await CommunityService.getFeed({
        limit: 20,
        scope,
        topic: feedView === 'discover' ? feedTopic : undefined,
        region: feedView === 'discover' ? feedRegion : undefined
      });
      const items = Array.isArray(feedData?.items) ? feedData.items : (Array.isArray(feedData) ? feedData : []);
      setPosts(items.map(normalizePost));
    } catch (error) {
      console.error('Feed load failed', error);
      showNotification('error', 'Community', 'Unable to load feed.');
    } finally {
      setFeedLoading(false);
    }
  }, [feedView, feedTopic, feedRegion, normalizePost, showNotification]);

  const loadMyPosts = useCallback(async () => {
    if (!user?.id) {
      setMyPosts([]);
      return;
    }
    try {
      const allPosts = await CommunityService.getPosts({ limit: 250, status: 'active' });
      const mine = (Array.isArray(allPosts) ? allPosts : [])
        .map(normalizePost)
        .filter((post) => resolvePostOwnerUserId(post) === String(user.id))
        .sort((a, b) => {
          const aTime = new Date(a.createdAt || 0).getTime();
          const bTime = new Date(b.createdAt || 0).getTime();
          return bTime - aTime;
        });
      setMyPosts(mine);
    } catch (error) {
      console.error('My posts load failed', error);
      setMyPosts([]);
    }
  }, [normalizePost, resolvePostOwnerUserId, user?.id]);

  useEffect(() => {
    if (user) {
      loadDashboard();
      setProfileBio(user.bio || '');
      setProfileUsername(user.username || user.email || '');
      setProfilePhoto({ id: user.profilePhotoFileId, url: user.avatar });
      if (!feedRegion) {
        setFeedRegion(user.location || user.country || '');
      }
    }
  }, [user, loadDashboard]);

  useEffect(() => {
    if (activeTab !== 'posts') return;
    loadFeed();
    loadMyPosts();
  }, [activeTab, feedView, feedTopic, feedRegion, loadFeed, loadMyPosts]);

  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(() => {
      loadDashboard();
    }, 45000);
    return () => clearInterval(interval);
  }, [isConnected, loadDashboard]);

  useEffect(() => {
    const refresh = () => {
      loadDashboard();
      if (activeTab === 'posts') {
        loadFeed();
        loadMyPosts();
      }
    };
    const events = [
      'community:post_created',
      'community:post_updated',
      'community:post_deleted',
      'community:post_reaction_updated',
      'community:comment_created',
      'community:follow_updated',
      'community:story_created',
      'community:story_deleted',
      'community:ad_status_updated',
      'community:ad_metrics_updated',
      'community:gcoin_balance_updated',
      'community:admin_config_updated',
      'community:business_page_updated'
    ];
    events.forEach((ev) => window.addEventListener(ev, refresh as EventListener));
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, refresh as EventListener));
    };
  }, [activeTab, loadDashboard, loadFeed, loadMyPosts]);

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

  const primaryAdPlacement = (Array.isArray(adDraft.placements) && adDraft.placements[0]) || adDraft.placement || 'community_feed';

  const adRateCard = useMemo(() => {
    const placement = String(primaryAdPlacement || 'community_feed').toLowerCase();
    const aliases = [placement];
    if (placement === 'community_feed') aliases.push('feed');
    if (placement === 'chat_sidebar') aliases.push('chat');
    let cpm = 0;
    let cpc = 0;
    for (const key of aliases) {
      const cpmValue = Number(adsConfig?.cpmByPlacement?.[key] ?? 0);
      const cpcValue = Number(adsConfig?.cpcByPlacement?.[key] ?? 0);
      if (!cpm && Number.isFinite(cpmValue) && cpmValue >= 0) cpm = cpmValue;
      if (!cpc && Number.isFinite(cpcValue) && cpcValue >= 0) cpc = cpcValue;
    }
    return { cpm, cpc };
  }, [adsConfig, primaryAdPlacement]);

  const estimatedImpressions = useMemo(() => {
    if (adDraft.pricingModel !== 'CPM') return 0;
    if (!adRateCard.cpm) return 0;
    return Math.floor((safeNumber(adDraft.budget) / adRateCard.cpm) * 1000);
  }, [adDraft.pricingModel, adRateCard.cpm, adDraft.budget]);

  const estimatedClicks = useMemo(() => {
    if (adDraft.pricingModel !== 'CPC') return 0;
    if (!adRateCard.cpc) return 0;
    return Math.floor(safeNumber(adDraft.budget) / adRateCard.cpc);
  }, [adDraft.pricingModel, adRateCard.cpc, adDraft.budget]);

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

  useEffect(() => {
    if (!cameraOpen) return;
    if (cameraVideoRef.current && cameraStream) {
      cameraVideoRef.current.srcObject = cameraStream;
    }
  }, [cameraOpen, cameraStream]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && isRecording) {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          console.error(e);
        }
      }
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream, isRecording]);

  const stopCamera = () => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error(e);
      }
      return;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }
    setCameraStream(null);
    setCameraOpen(false);
    setIsRecording(false);
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      showNotification('warning', 'Camera', 'Camera access is not available in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setCameraStream(stream);
      setCameraOpen(true);
    } catch (error) {
      console.error(error);
      showNotification('error', 'Camera', 'Unable to access camera.');
    }
  };

  const captureCameraPhoto = async () => {
    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;
    if (!video || !canvas) return;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        const file = new File([blob], `camera-${Date.now()}.png`, { type: blob.type || 'image/png' });
        await queuePostMediaUpload(file);
        showNotification('success', 'Camera', 'Captured media added.');
      } catch (error) {
        console.error(error);
        showNotification('error', 'Camera', 'Capture upload failed.');
      } finally {
        stopCamera();
      }
    }, 'image/png');
  };

  const startRecording = () => {
    if (!cameraStream || isRecording) return;
    if (typeof MediaRecorder === 'undefined') {
      showNotification('warning', 'Camera', 'Video recording is not supported in this browser.');
      return;
    }
    recordedChunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(cameraStream, { mimeType: 'video/webm' });
    } catch (e) {
      recorder = new MediaRecorder(cameraStream);
    }
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };
    recorder.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
      if (!blob.size) return;
      try {
        const file = new File([blob], `camera-${Date.now()}.webm`, { type: blob.type });
        await queuePostMediaUpload(file);
        showNotification('success', 'Camera', 'Video captured and added.');
      } catch (error) {
        console.error(error);
        showNotification('error', 'Camera', 'Video upload failed.');
      } finally {
        setIsRecording(false);
        stopCamera();
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current) return;
    try {
      mediaRecorderRef.current.stop();
    } catch (e) {
      console.error(e);
    }
  };

  const updatePostMedia = (localId: string, patch: Partial<PostMediaItem>) => {
    setPostDraft((prev) => {
      const next = prev.media.map((item) => (item.localId === localId ? { ...item, ...patch } : item));
      return { ...prev, media: next };
    });
  };

  const replacePostMedia = (localId: string, nextItem: PostMediaItem) => {
    setPostDraft((prev) => {
      const next = prev.media.map((item) => (item.localId === localId ? { ...item, ...nextItem } : item));
      return { ...prev, media: next };
    });
  };

  const queuePostMediaUpload = async (file: File, replaceId?: string | null) => {
    const localId = replaceId || `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const previewUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video');
    const baseItem: PostMediaItem = {
      localId,
      url: previewUrl,
      previewUrl,
      name: file.name,
      type: isVideo ? 'video' : 'image',
      progress: 0,
      uploading: true
    };

    if (replaceId) {
      replacePostMedia(localId, baseItem);
    } else {
      setPostDraft((prev) => ({ ...prev, media: [...prev.media, baseItem] }));
    }

    try {
      const uploaded = await FileService.uploadFile(file, 'community', {
        onProgress: (percent) => {
          updatePostMedia(localId, { progress: percent });
        }
      });
      // revoke preview URL after successful upload
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      updatePostMedia(localId, {
        id: uploaded.id,
        url: uploaded.url,
        name: uploaded.name || file.name,
        type: (uploaded.type as any) || baseItem.type,
        progress: 100,
        uploading: false,
        error: undefined,
        previewUrl: undefined
      });
      showNotification('success', 'Media', 'Media added to your post');
    } catch (error) {
      console.error(error);
      updatePostMedia(localId, {
        uploading: false,
        error: 'Upload failed',
        progress: 0
      });
      showNotification('error', 'Media', 'Upload failed');
    }
  };

  const applySelectedPostMedia = (files: UploadedFile[]) => {
    if (!files.length) return;
    const replaceTarget = replaceMediaId;
    setReplaceMediaId(null);
    const mapped = files.map((file, index) => {
      const mediaType = inferMediaType({
        url: file.url,
        mimeType: file.mimeType || file.mime_type,
        type: file.type
      }) as PostMediaItem['type'];
      return {
        localId: file.id || `media-${Date.now()}-${index}`,
        id: file.id,
        url: file.url,
        name: file.name,
        type: mediaType,
        progress: 100,
        uploading: false
      } as PostMediaItem;
    });
    if (!mapped.length) return;

    if (replaceTarget && mapped[0]) {
      replacePostMedia(replaceTarget, mapped[0]);
      if (mapped.length > 1) {
        setPostDraft((prev) => ({ ...prev, media: [...prev.media, ...mapped.slice(1)] }));
      }
      return;
    }

    setPostDraft((prev) => ({ ...prev, media: [...prev.media, ...mapped] }));
  };

  const handlePostMediaSelected = (file: UploadedFile) => {
    applySelectedPostMedia([file]);
  };

  const handlePostMediaSelectedMultiple = (files: UploadedFile[]) => {
    applySelectedPostMedia(files);
  };

  const handlePostMediaRemove = (localId: string) => {
    setPostDraft((prev) => {
      const next = prev.media.filter((item) => item.localId !== localId);
      const removed = prev.media.find((item) => item.localId === localId);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return { ...prev, media: next };
    });
  };

  const handlePostMediaReplace = (localId: string) => {
    setReplaceMediaId(localId);
    setShowPostMediaPicker(true);
  };

  const handlePostSubmit = async () => {
    if (postDraft.media.some((item) => item.uploading)) {
      showNotification('warning', 'Posts', 'Wait for uploads to finish before posting.');
      return;
    }
    if (postDraft.media.some((item) => item.error)) {
      showNotification('warning', 'Posts', 'Remove failed uploads before posting.');
      return;
    }
    const attachmentFileIds = postDraft.media.map((m) => m.id).filter(Boolean);
    const hasText = Boolean(postDraft.title.trim() || postDraft.content.trim());
    if (!hasText && attachmentFileIds.length === 0) {
      showNotification('warning', 'Posts', 'Add text or at least one attachment.');
      return;
    }
    setPosting(true);
    try {
      await CommunityService.createPost({
        title: postDraft.title.trim(),
        content: postDraft.content,
        attachmentFileIds,
        topic: postDraft.topic || undefined,
        location: postDraft.location || undefined,
        visibility: postDraft.visibility
      });
      showNotification('success', 'Community', 'Post shared with the community.');
      setPostDraft({ title: '', content: '', tags: '', mentions: '', topic: '', location: '', media: [], visibility: 'public' });
      await Promise.all([loadFeed(), loadMyPosts(), loadDashboard()]);
    } catch (error) {
      console.error(error);
      showNotification('error', 'Community', 'Could not share your update.');
    } finally {
      setPosting(false);
    }
  };

  const setPostBusy = (postId: string, busy: boolean) => {
    setPostActionBusy((current) => ({ ...current, [postId]: busy }));
  };

  const applyPostPatch = useCallback((postId: string, patch: Partial<CommunityPost>) => {
    const apply = (list: CommunityPost[]) => list.map((item) => (item.id === postId ? { ...item, ...patch } : item));
    setPosts((current) => apply(current));
    setMyPosts((current) => apply(current));
  }, []);

  const removePostLocal = useCallback((postId: string) => {
    setPosts((current) => current.filter((item) => item.id !== postId));
    setMyPosts((current) => current.filter((item) => item.id !== postId));
  }, []);

  const canManagePost = useCallback(
    (post: CommunityPost) => resolvePostOwnerUserId(post) === String(user?.id || ''),
    [resolvePostOwnerUserId, user?.id]
  );

  const beginEditPost = (post: CommunityPost) => {
    if (!canManagePost(post)) return;
    setEditingPostId(post.id);
    setEditingPostDraft({
      title: post.title || '',
      content: post.content || '',
      tags: (post.tags || []).join(', '),
      mentions: (post.mentions || []).join(', '),
      topic: post.topic || '',
      location: post.location || '',
      visibility: (post.visibility as PostDraft['visibility']) || 'public'
    });
  };

  const cancelEditPost = () => {
    setEditingPostId(null);
    setEditingPostDraft(null);
  };

  const saveEditPost = async () => {
    if (!editingPostId || !editingPostDraft) return;
    if (!editingPostDraft.content.trim()) {
      showNotification('warning', 'Posts', 'Post content cannot be empty.');
      return;
    }
    setPostBusy(editingPostId, true);
    try {
      const updated = await CommunityService.updatePost(editingPostId, {
        title: editingPostDraft.title.trim(),
        content: editingPostDraft.content.trim(),
        tags: editingPostDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        mentions: editingPostDraft.mentions.split(',').map((entry) => entry.trim()).filter(Boolean),
        topic: editingPostDraft.topic || undefined,
        location: editingPostDraft.location || undefined,
        visibility: editingPostDraft.visibility
      });
      if (updated) {
        const normalized = normalizePost(updated);
        applyPostPatch(editingPostId, normalized);
      }
      cancelEditPost();
      showNotification('success', 'Posts', 'Post updated.');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.message || 'Unable to update post.';
      showNotification('error', 'Posts', message);
    } finally {
      setPostBusy(editingPostId, false);
    }
  };

  const toggleLikePost = async (post: CommunityPost) => {
    if (!user?.id) {
      showNotification('warning', 'Posts', 'Please sign in to like posts.');
      return;
    }
    const liked = Boolean(post.userState?.liked);
    const nextLikes = Math.max(0, Number(post.interactions?.likes || 0) + (liked ? -1 : 1));
    applyPostPatch(post.id, {
      interactions: { ...(post.interactions || {}), likes: nextLikes },
      userState: { ...(post.userState || {}), liked: !liked }
    });
    try {
      if (liked) {
        await CommunityService.postUnlike(post.id);
      } else {
        await CommunityService.postLike(post.id);
      }
    } catch (error) {
      applyPostPatch(post.id, {
        interactions: { ...(post.interactions || {}), likes: Number(post.interactions?.likes || 0) },
        userState: { ...(post.userState || {}), liked }
      });
      showNotification('error', 'Posts', 'Unable to update like.');
    }
  };

  const repostPost = async (post: CommunityPost) => {
    if (!user?.id) {
      showNotification('warning', 'Posts', 'Please sign in to repost.');
      return;
    }
    setPostBusy(post.id, true);
    try {
      await CommunityService.postRepost(post.id);
      showNotification('success', 'Posts', 'Post reposted to your profile.');
      await Promise.all([loadFeed(), loadMyPosts()]);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.message || 'Unable to repost.';
      showNotification('error', 'Posts', message);
    } finally {
      setPostBusy(post.id, false);
    }
  };

  const removeRepost = async (post: CommunityPost) => {
    if (!canManagePost(post)) return;
    if (!confirm('Remove this repost from your profile?')) return;
    setPostBusy(post.id, true);
    try {
      await CommunityService.deletePost(post.id);
      removePostLocal(post.id);
      showNotification('success', 'Posts', 'Repost removed.');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.message || 'Unable to remove repost.';
      showNotification('error', 'Posts', message);
    } finally {
      setPostBusy(post.id, false);
    }
  };

  const deleteOwnPost = async (post: CommunityPost) => {
    if (!canManagePost(post)) return;
    if (!confirm('Delete this post?')) return;
    setPostBusy(post.id, true);
    try {
      await CommunityService.deletePost(post.id);
      removePostLocal(post.id);
      if (editingPostId === post.id) cancelEditPost();
      showNotification('success', 'Posts', 'Post deleted.');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.message || 'Unable to delete post.';
      showNotification('error', 'Posts', message);
    } finally {
      setPostBusy(post.id, false);
    }
  };

  const togglePinPost = async (post: CommunityPost) => {
    if (!canManagePost(post)) return;
    setPostBusy(post.id, true);
    try {
      const updated = await CommunityService.updatePost(post.id, { isPinned: !post.isPinned });
      if (updated) {
        applyPostPatch(post.id, normalizePost(updated));
      } else {
        applyPostPatch(post.id, { isPinned: !post.isPinned });
      }
      showNotification('success', 'Posts', post.isPinned ? 'Post unpinned.' : 'Post pinned.');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.message || 'Unable to update pin status.';
      showNotification('error', 'Posts', message);
    } finally {
      setPostBusy(post.id, false);
    }
  };

  const sharePost = async (post: CommunityPost) => {
    const postUrl = `${window.location.origin}/post/${post.id}`;
    try {
      await CommunityService.postShare(post.id);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(postUrl);
      }
      showNotification('success', 'Posts', 'Post link copied and shared.');
      applyPostPatch(post.id, {
        interactions: { ...(post.interactions || {}), shares: Number(post.interactions?.shares || 0) + 1 }
      });
    } catch {
      showNotification('error', 'Posts', 'Unable to share post.');
    }
  };

  const setNetworkBusy = (key: string, value: boolean) => {
    setNetworkActionBusy((current) => ({ ...current, [key]: value }));
  };

  const refreshNetworkLists = useCallback(async () => {
    const [nextFollowers, nextFollowing] = await Promise.all([fetchFollowers(), fetchFollowing()]);
    setFollowers(nextFollowers);
    setFollowing(nextFollowing);
    setInsights((prev) => ({ ...prev, followers: nextFollowers.length }));
  }, [fetchFollowers, fetchFollowing]);

  const handleFollowToggle = async (profile: CreatorProfile) => {
    if (!user) return;
    const busyKey = `follow:${profile.id}`;
    if (networkActionBusy[busyKey]) return;
    try {
      setNetworkBusy(busyKey, true);
      let nextFollowId = profile.followId;
      if (profile.following && profile.followId) {
        await CommunityService.unfollowTarget(profile.followId);
      } else if (!profile.following) {
        const result = await CommunityService.followTarget({ targetType: 'user', targetId: profile.id });
        nextFollowId = result?.id || result?.data?.id || profile.followId;
      }
      setSuggested((current) =>
        current.map((item) => (item.id === profile.id ? { ...item, following: !profile.following, followId: nextFollowId } : item))
      );
      await refreshNetworkLists();
      showNotification('success', 'Social', profile.following ? 'Unfollowed' : 'Now following');
    } catch (error) {
      console.error(error);
      showNotification('error', 'Social', 'Action failed.');
    } finally {
      setNetworkBusy(busyKey, false);
    }
  };

  const handleUnfollow = async (profile: CreatorProfile) => {
    if (!user || !profile?.id) return;
    const busyKey = `unfollow:${profile.id}`;
    if (networkActionBusy[busyKey]) return;
    try {
      setNetworkBusy(busyKey, true);
      if (profile.followId) {
        await CommunityService.unfollowTarget(profile.followId);
      } else {
        await CommunityService.unfollowUser(profile.id);
      }
      setFollowing((current) => current.filter((entry) => entry.id !== profile.id));
      setSuggested((current) =>
        current.map((entry) => (entry.id === profile.id ? { ...entry, following: false, followId: undefined } : entry))
      );
      await refreshNetworkLists();
      showNotification('success', 'Social', 'Unfollowed successfully.');
    } catch (error) {
      console.error(error);
      showNotification('error', 'Social', 'Unable to unfollow user.');
    } finally {
      setNetworkBusy(busyKey, false);
    }
  };

  const handleBlockToggle = async (profile: CreatorProfile) => {
    if (!user || !profile?.id) return;
    const busyKey = `block:${profile.id}`;
    if (networkActionBusy[busyKey]) return;
    try {
      setNetworkBusy(busyKey, true);
      if (profile.isBlocked) {
        await CommunityService.unblockUser(profile.id);
      } else {
        await CommunityService.blockUser(profile.id);
      }
      await refreshNetworkLists();
      setSuggested((current) =>
        current.map((entry) => (entry.id === profile.id ? { ...entry, isBlocked: !profile.isBlocked } : entry))
      );
      showNotification('success', 'Social', profile.isBlocked ? 'User unblocked.' : 'User blocked.');
    } catch (error) {
      console.error(error);
      showNotification('error', 'Social', 'Unable to update block status.');
    } finally {
      setNetworkBusy(busyKey, false);
    }
  };

  const handleStoryMediaSelected = (file: UploadedFile) => {
    if (!file) return;
    const mime = `${file.mime_type || file.type || ''}`.toLowerCase();
    const isVideo = mime.startsWith('video');
    setStoryDraft((prev) => ({
      ...prev,
      media: file,
      type: isVideo ? 'video' : 'image'
    }));
    setShowStoryMediaPicker(false);
    showNotification('success', 'Stories', 'Media added to your story.');
  };

  const handleStoryCreate = async () => {
    if (storyDraft.type === 'text' && !storyDraft.content.trim()) {
      showNotification('warning', 'Stories', 'Add text to publish a story.');
      return;
    }
    if ((storyDraft.type === 'image' || storyDraft.type === 'video') && !storyDraft.media?.id) {
      showNotification('warning', 'Stories', 'Add media to publish a story.');
      return;
    }
    setStoryPosting(true);
    try {
      await CommunityService.createStory({
        type: storyDraft.type,
        content: storyDraft.content || undefined,
        mediaFileId: storyDraft.type === 'text' ? undefined : storyDraft.media?.id,
        visibility: storyDraft.visibility,
        textBackground: storyDraft.type === 'text' ? storyDraft.textBackground : undefined,
        textColor: storyDraft.type === 'text' ? storyDraft.textColor : undefined,
        textFont: storyDraft.type === 'text' ? storyDraft.textFont : undefined,
        textAlign: storyDraft.type === 'text' ? storyDraft.textAlign : undefined
      });
      setStoryDraft({
        type: 'text',
        content: '',
        visibility: 'public',
        media: null,
        ...getDefaultStoryTextDraft()
      });
      showNotification('success', 'Stories', 'Story posted.');
      setStories(await CommunityService.getStoriesFeed());
    } catch (error) {
      console.error(error);
      showNotification('error', 'Stories', 'Unable to post story.');
    } finally {
      setStoryPosting(false);
    }
  };

  const handleStoryDelete = async (id: string) => {
    try {
      await CommunityService.deleteStory(id);
      setStories((current) => current.filter((story) => story.id !== id));
      showNotification('success', 'Stories', 'Story removed.');
    } catch (error) {
      console.error(error);
      showNotification('error', 'Stories', 'Unable to delete story.');
    }
  };

  const handleBusinessCreate = () => {
    if (!businessConfig.businessPagesEnabled || !businessConfig.businessPageUserCreationEnabled) {
      showNotification('warning', 'Business Page', 'Business page creation is currently disabled by admin.');
      return;
    }
    const newPage: BusinessPage = {
      ...emptyBusiness,
      id: '',
      name: '',
      handle: '',
      slug: ''
    };
    setBusiness(newPage);
    setActiveBusinessId('');
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldCreate = params.get('createPage') === '1';
    if (!shouldCreate) {
      createPageRequestRef.current = '';
      return;
    }
    if (activeTab !== 'business' || loading) return;
    const requestKey = `${location.pathname}?${location.search}`;
    if (createPageRequestRef.current === requestKey) return;
    createPageRequestRef.current = requestKey;
    handleBusinessCreate();
    params.delete('createPage');
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  }, [activeTab, loading, location.pathname, location.search, navigate, handleBusinessCreate]);

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
      if (next.id) {
        setBusinessPages((current) => current.map((page) => (page.id === next.id ? next : page)));
      }
      return next;
    });
  };

  const handleBusinessLogoSelected = (file: UploadedFile) => {
    handleBusinessUpdate({ logoFileId: file.id, logo: { id: file.id, url: file.url } });
    showNotification('success', 'Business Page', 'Logo selected from Uploaded Files.');
  };

  const handleBusinessCoverSelected = (file: UploadedFile) => {
    handleBusinessUpdate({ coverFileId: file.id, cover: { id: file.id, url: file.url } });
    showNotification('success', 'Business Page', 'Cover selected from Uploaded Files.');
  };

  const handleBusinessFollowToggle = async () => {
    if (!user) {
      showNotification('warning', 'Business Page', 'Sign in to follow business pages.');
      return;
    }
    if (!businessConfig.businessPagesEnabled || !businessConfig.businessPageFollowEnabled) {
      showNotification('warning', 'Business Page', 'Business page follows are currently disabled by admin.');
      return;
    }
    if (!business.id || businessFollowBusy) return;
    try {
      setBusinessFollowBusy(true);
      let nextFollowId = business.followId;
      let nextIsFollowing = !!business.isFollowing;
      let nextFollowersCount = Number(business.followersCount || 0);

      if (business.isFollowing && business.followId) {
        await CommunityService.unfollowTarget(business.followId);
        nextIsFollowing = false;
        nextFollowId = undefined;
        nextFollowersCount = Math.max(0, nextFollowersCount - 1);
      } else {
        const result = await CommunityService.followTarget({ targetType: 'page', targetId: business.id });
        nextIsFollowing = true;
        nextFollowId = result?.id || result?.data?.id || business.followId;
        nextFollowersCount += 1;
      }

      const updated = {
        ...business,
        isFollowing: nextIsFollowing,
        followId: nextFollowId,
        followersCount: nextFollowersCount
      };
      setBusiness(updated);
      setBusinessPages((current) => current.map((page) => (page.id === updated.id ? updated : page)));
      showNotification('success', 'Business Page', nextIsFollowing ? 'Now following page.' : 'Unfollowed page.');
    } catch (error) {
      console.error(error);
      showNotification('error', 'Business Page', 'Unable to update follow status.');
    } finally {
      setBusinessFollowBusy(false);
    }
  };

  const handleBusinessSave = async () => {
    setBusinessSaving(true);
    try {
      const payload = {
        name: business.name,
        handle: business.handle || toSlug(business.name || formattedUserName),
        slug: business.slug || toSlug(business.name || formattedUserName),
        tagline: business.tagline || '',
        category: business.category || '',
        description: business.description || '',
        website: business.website || '',
        email: business.email || '',
        phone: business.phone || '',
        industry: business.industry || '',
        orgSize: business.orgSize || '',
        orgType: business.orgType || '',
        location: business.location || '',
        logoFileId: business.logoFileId || undefined,
        coverFileId: business.coverFileId || undefined
      };
      let saved: any = null;
      if (!businessConfig.businessPagesEnabled) {
        showNotification('warning', 'Business Page', 'Business pages are currently disabled by admin.');
        return;
      }
      if (!business.id && !businessConfig.businessPageUserCreationEnabled) {
        showNotification('warning', 'Business Page', 'Business page creation is currently disabled by admin.');
        return;
      }
      if (business.id) {
        saved = await CommunityService.updateBusinessPage(business.id, payload);
      } else {
        saved = await CommunityService.createBusinessPage(payload);
      }
      const merged = { ...business, ...payload, ...saved };
      const updatedPages = business.id
        ? businessPages.map((page) => (page.id === business.id ? merged : page))
        : [merged, ...businessPages];
      setBusiness(merged);
      setBusinessPages(updatedPages);
      setActiveBusinessId(merged.id || '');
      const eventName = business.id ? 'community:business_page_updated' : 'community:business_page_created';
      window.dispatchEvent(new CustomEvent(eventName, { detail: { page: merged } }));
      showNotification('success', 'Business Page', 'Business page saved.');
    } catch (error) {
      console.error(error);
      showNotification('error', 'Business Page', 'Save failed.');
    } finally {
      setBusinessSaving(false);
    }
  };

  const handleBusinessDelete = async () => {
    if (!business.id) {
      showNotification('warning', 'Business Page', 'Select a business page to delete.');
      return;
    }
    const confirmed = window.confirm(`Delete "${business.name || 'this business page'}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      setBusinessSaving(true);
      await CommunityService.deleteBusinessPage(business.id);
      const remaining = businessPages.filter((page) => page.id !== business.id);
      setBusinessPages(remaining);
      if (remaining.length) {
        setBusiness(remaining[0]);
        setActiveBusinessId(remaining[0].id || '');
      } else {
        const fallback = {
          ...emptyBusiness,
          name: formattedUserName,
          handle: toSlug(formattedUserName),
          slug: toSlug(formattedUserName)
        };
        setBusiness(fallback);
        setActiveBusinessId('');
      }
      window.dispatchEvent(new CustomEvent('community:business_page_updated', { detail: { pageId: business.id, deleted: true } }));
      showNotification('success', 'Business Page', 'Business page deleted.');
    } catch (error) {
      console.error(error);
      showNotification('error', 'Business Page', 'Unable to delete page.');
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

  const handleProfilePhotoSelected = (file: UploadedFile) => {
    setProfilePhoto({ id: file.id, url: file.url });
    showNotification('success', 'Profile', 'Photo selected from Uploaded Files.');
  };

  const openProfilePhotoPicker = () => setAssetPickerTarget('profile');
  const openBusinessLogoPicker = () => setAssetPickerTarget('business-logo');
  const openBusinessCoverPicker = () => setAssetPickerTarget('business-cover');

  const handleAssetPickerSelect = (file: UploadedFile) => {
    const target = assetPickerTarget;
    setAssetPickerTarget(null);
    if (!target) return;
    if (target === 'profile') {
      handleProfilePhotoSelected(file);
      return;
    }
    if (target === 'business-logo') {
      handleBusinessLogoSelected(file);
      return;
    }
    handleBusinessCoverSelected(file);
  };

  const handleAdSubmit = async (mode: 'draft' | 'submit' | 'pay') => {
    if (!adDraft.title.trim() || !adDraft.body.trim()) {
      showNotification('warning', 'Ads', 'Title and body are required.');
      return;
    }
    if (adDraft.destinationType === 'url' && !adDraft.destinationUrl.trim()) {
      showNotification('warning', 'Ads', 'Target URL is required for traffic ads.');
      return;
    }
    const maxPlacements = Math.max(1, Math.min(3, Number(adsConfig?.maxPlacementsPerAd ?? 3)));
    const normalizedPlacements = Array.from(
      new Set(
        (Array.isArray(adDraft.placements) ? adDraft.placements : [adDraft.placement])
          .map((placement) => String(placement || '').trim().toLowerCase())
          .map((placement) => {
            if (placement === 'feed') return 'community_feed';
            if (placement === 'chat') return 'chat_sidebar';
            return placement;
          })
          .filter(Boolean)
      )
    ).slice(0, maxPlacements);
    if (normalizedPlacements.length === 0) {
      showNotification('warning', 'Ads', 'Select at least one placement.');
      return;
    }
    if (safeNumber(adDraft.dailySpend) > 0 && safeNumber(adDraft.dailySpend) > safeNumber(adDraft.budget)) {
      showNotification('warning', 'Ads', 'Daily spend cannot exceed total budget.');
      return;
    }
    setAdActionLoading(true);
    try {
      const targetCountries = Array.from(
        new Set(
          String(adDraft.targetCountries || '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        )
      );
      const pricingModel = adDraft.pricingModel === 'CPC' ? 'CPC' : 'CPM';
      const payload = {
        title: adDraft.title,
        body: adDraft.body,
        objective: adDraft.objective,
        placement: normalizedPlacements[0],
        placements: normalizedPlacements,
        pricingModel,
        computeOption: pricingModel,
        targetCountries,
        targetAudience: adDraft.targetAudience,
        dailySpend: safeNumber(adDraft.dailySpend) > 0 ? safeNumber(adDraft.dailySpend) : undefined,
        budget: safeNumber(adDraft.budget),
        currency: adDraft.currency,
        destinationType: adDraft.destinationType,
        destinationUrl: adDraft.destinationType === 'url' ? adDraft.destinationUrl : null,
        ctaText: adDraft.ctaText || null,
        mediaFileIds: adDraft.media.map((m) => m.id),
        targeting: {
          placements: normalizedPlacements,
          pricingModel,
          targetCountries,
          targetAudience: adDraft.targetAudience,
          dailySpend: safeNumber(adDraft.dailySpend) > 0 ? safeNumber(adDraft.dailySpend) : null,
          estimated:
            pricingModel === 'CPM'
              ? { pricingModel, estimatedImpressions, estimatedClicks: 0 }
              : { pricingModel, estimatedImpressions: 0, estimatedClicks }
        }
      };
      const startAt = new Date();
      const durationDays = Math.max(1, Number(adDraft.durationDays || 1));
      const endAt = new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
      const draft: any = await AdService.saveCampaign({ ...payload, durationDays, status: mode === 'submit' ? 'DRAFT' : undefined } as any);
      if (draft?.id) {
        await AdService.updateAd(draft.id, { startAt, endAt, durationDays, mediaFileIds: payload.mediaFileIds } as any);
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
          paymentMethodId: selectedGatewayId,
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
        name: file.name,
        type: file.type,
        mimeType: file.mime_type || file.mimeType
      }));
      const maxImages = Math.max(1, Math.min(12, Number(adsConfig?.maxImageAssets ?? 6)));
      const maxVideos = Math.max(1, Math.min(3, Number(adsConfig?.maxVideoAssets ?? 1)));
      let blockedImages = 0;
      let blockedVideos = 0;
      setAdDraft((prev) => ({
        ...prev,
        media: (() => {
          const next = [...prev.media];
          let imageCount = next.reduce((count, media) => {
            const mime = String(media.mimeType || media.type || '').toLowerCase();
            return mime.startsWith('video/') ? count : count + 1;
          }, 0);
          let videoCount = next.reduce((count, media) => {
            const mime = String(media.mimeType || media.type || '').toLowerCase();
            return mime.startsWith('video/') ? count + 1 : count;
          }, 0);
          for (const media of mapped) {
            if (!media.id || next.some((item) => item.id === media.id)) continue;
            const mime = String(media.mimeType || media.type || '').toLowerCase();
            const isVideo = mime.startsWith('video/');
            if (isVideo) {
              if (videoCount >= maxVideos) {
                blockedVideos += 1;
                continue;
              }
              videoCount += 1;
            } else {
              if (imageCount >= maxImages) {
                blockedImages += 1;
                continue;
              }
              imageCount += 1;
            }
            next.push(media);
          }
          return next;
        })()
      }));
      if (blockedImages > 0 || blockedVideos > 0) {
        showNotification(
          'warning',
          'Ads',
          `Only ${maxImages} images and ${maxVideos} video are allowed per campaign.`
        );
      } else {
        showNotification('success', 'Ads', 'Media added from uploaded files.');
      }
  };

  const handleAdMediaRemove = (id: string) => {
    setAdDraft((prev) => ({
      ...prev,
      media: prev.media.filter((item) => item.id !== id)
    }));
  };

    const tabsMenu = (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
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

    const renderAttachments = (attachments?: CommunityPost['attachments']) => {
      if (!attachments?.length) return null;
      return (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {attachments.map((media) => {
            const type = inferMediaType(media || {});
            if (type === 'video') {
              return (
                <div key={media.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <video src={media.url} controls className="h-48 w-full object-cover" />
                </div>
              );
            }
            if (type === 'image') {
              return (
                <div key={media.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <img src={media.url} alt={media.name || 'Post media'} className="h-48 w-full object-cover" />
                </div>
              );
            }
            return (
              <div key={media.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                <a href={media.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                  {media.name || media.url?.split('/').pop() || 'View attachment'}
                </a>
              </div>
            );
          })}
        </div>
      );
    };

  const renderFeed = () => (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Community Pulse</p>
          <h2 className="text-2xl font-bold text-slate-900">What everyone is sharing</h2>
        </div>
        <button
          onClick={loadFeed}
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh Feed
        </button>
      </header>
      <div className="flex flex-wrap gap-2">
        {([
          { id: 'all', label: 'All' },
          { id: 'discover', label: 'Discover' },
          { id: 'following', label: 'Following' }
        ] as const).map((item) => (
          <button
            key={item.id}
            onClick={() => setFeedView(item.id)}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
              feedView === item.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {feedView === 'discover' && (
        <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm space-y-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Discover filters</p>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={feedTopic}
              onChange={(e) => setFeedTopic(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">All topics</option>
              {topicOptions.map((topic) => (
                <option key={topic} value={topic}>{topic}</option>
              ))}
            </select>
            <input
              value={feedRegion}
              onChange={(e) => setFeedRegion(e.target.value)}
              placeholder="Region or city"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <p className="text-xs text-slate-500">Trending posts are ranked by engagement. Recommended matches your topic and region.</p>
        </div>
      )}
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="space-y-3">
          <input
            value={postDraft.title}
            onChange={(e) => setPostDraft((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Optional headline"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <MentionHashtagTextarea
            value={postDraft.content}
            onChange={(nextValue) => setPostDraft((prev) => ({ ...prev, content: nextValue }))}
            placeholder="Share an update, ask a question, or celebrate success."
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => {
                setReplaceMediaId(null);
                setShowPostMediaPicker(true);
              }}
              className="rounded-full bg-slate-100 px-3 py-1 font-semibold uppercase text-slate-600 shadow-inner"
            >
              <Camera className="mr-1 inline h-3.5 w-3.5" />
              Library / Upload
            </button>
            <button
              type="button"
              onClick={startCamera}
              className="rounded-full bg-slate-900 px-3 py-1 font-semibold uppercase text-white"
            >
              Live camera
            </button>
            <span className="text-slate-500">#tags and @mentions supported</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {postDraft.media.map((media) => (
              <div key={media.localId} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{media.name || 'Media'}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handlePostMediaReplace(media.localId)}
                      className="text-xs font-semibold text-blue-600"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePostMediaRemove(media.localId)}
                      className="text-xs font-semibold text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {media.type === 'video' ? (
                    <video src={media.url} className="h-40 w-full object-cover" controls />
                  ) : (
                    <img src={media.url} alt={media.name || 'media'} className="h-40 w-full object-cover" />
                  )}
                </div>
                {media.uploading && (
                  <div className="mt-2">
                    <div className="h-2 w-full rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full bg-blue-600"
                        style={{ width: `${media.progress || 0}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">Uploading {media.progress || 0}%</p>
                  </div>
                )}
                {media.error && <p className="mt-2 text-[10px] text-red-500">{media.error}</p>}
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={postDraft.visibility}
              onChange={(e) => setPostDraft((prev) => ({ ...prev, visibility: e.target.value as PostDraft['visibility'] }))}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="public">Visibility: Public</option>
              <option value="friends">Visibility: Friends</option>
              <option value="network">Visibility: Network</option>
              <option value="private">Visibility: Private</option>
              <option value="custom">Visibility: Custom</option>
            </select>
            <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              #tags and @mentions supported
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={postDraft.topic}
              onChange={(e) => setPostDraft((prev) => ({ ...prev, topic: e.target.value }))}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select a topic</option>
              {topicOptions.map((topic) => (
                <option key={topic} value={topic}>{topic}</option>
              ))}
            </select>
            <input
              value={postDraft.location}
              onChange={(e) => setPostDraft((prev) => ({ ...prev, location: e.target.value }))}
              placeholder="Location (city, region)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span>Tip: type @ to mention people and # to add tags to your post.</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Posting as {formattedUserName}</p>
          </div>
          <button
            onClick={handlePostSubmit}
            disabled={posting || hasPostUploads}
            className="rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {posting ? 'Posting...' : hasPostUploads ? 'Uploading...' : 'Post update'}
          </button>
        </div>
      </div>
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Manage posts</p>
            <h3 className="text-lg font-semibold text-slate-900">Your posts and reposts</h3>
          </div>
          <button
            onClick={loadMyPosts}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
        {myPosts.length === 0 ? (
          <p className="text-sm text-slate-500">You have not posted yet.</p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">My posts</p>
              {myPosts.filter((post) => !post.originalPostId).length === 0 ? (
                <p className="text-sm text-slate-500">No original posts yet.</p>
              ) : (
                myPosts
                  .filter((post) => !post.originalPostId)
                  .map((post) => {
                    const busy = Boolean(postActionBusy[post.id]);
                    const liked = Boolean(post.userState?.liked);
                    const likes = Number(post.interactions?.likes || 0);
                    return (
                      <article key={post.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        {editingPostId === post.id && editingPostDraft ? (
                          <div className="space-y-3">
                            <input
                              value={editingPostDraft.title}
                              onChange={(e) => setEditingPostDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                              placeholder="Title"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            />
                            <textarea
                              value={editingPostDraft.content}
                              onChange={(e) => setEditingPostDraft((prev) => (prev ? { ...prev, content: e.target.value } : prev))}
                              rows={4}
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            />
                            <div className="grid gap-2 md:grid-cols-2">
                              <input
                                value={editingPostDraft.tags}
                                onChange={(e) => setEditingPostDraft((prev) => (prev ? { ...prev, tags: e.target.value } : prev))}
                                placeholder="Tags"
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              />
                              <input
                                value={editingPostDraft.mentions}
                                onChange={(e) => setEditingPostDraft((prev) => (prev ? { ...prev, mentions: e.target.value } : prev))}
                                placeholder="Mentions"
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              />
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEditPost}
                                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={saveEditPost}
                                disabled={busy}
                                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                              >
                                {busy ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{post.title || 'Untitled post'}</p>
                                <p className="text-xs text-slate-500">
                                  {post.createdAt ? new Date(post.createdAt).toLocaleString() : 'Just now'}
                                </p>
                              </div>
                              {post.isPinned ? (
                                <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                  Pinned
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm text-slate-700 line-clamp-3">
                              <MentionText text={post.content} viewerId={user?.id} viewerUsername={user?.username} />
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() => toggleLikePost(post)}
                                className={`rounded-full border px-3 py-1 font-semibold ${liked ? 'border-pink-200 bg-pink-50 text-pink-700' : 'border-slate-200 text-slate-600'}`}
                              >
                                {liked ? 'Liked' : 'Like'} ({likes})
                              </button>
                              <button type="button" onClick={() => repostPost(post)} className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600">
                                Repost
                              </button>
                              <button type="button" onClick={() => sharePost(post)} className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600">
                                Share
                              </button>
                              <button type="button" onClick={() => togglePinPost(post)} className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600">
                                {post.isPinned ? 'Unpin' : 'Pin'}
                              </button>
                              <button type="button" onClick={() => beginEditPost(post)} className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600">
                                Edit
                              </button>
                              <button type="button" onClick={() => deleteOwnPost(post)} className="rounded-full border border-rose-200 px-3 py-1 font-semibold text-rose-600">
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    );
                  })
              )}
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">My reposts</p>
              {myPosts.filter((post) => !!post.originalPostId).length === 0 ? (
                <p className="text-sm text-slate-500">No reposts yet.</p>
              ) : (
                myPosts
                  .filter((post) => !!post.originalPostId)
                  .map((post) => (
                    <article key={post.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Reposted {post.originalPost?.authorName ? `from ${post.originalPost.authorName}` : 'content'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {post.createdAt ? new Date(post.createdAt).toLocaleString() : 'Just now'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRepost(post)}
                          className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600"
                        >
                          Remove repost
                        </button>
                      </div>
                      <p className="mt-2 text-sm text-slate-700 line-clamp-3">
                        <MentionText text={post.content} viewerId={user?.id} viewerUsername={user?.username} />
                      </p>
                    </article>
                  ))
              )}
            </div>
          </div>
        )}
      </div>
      <div className="space-y-6">
        {feedLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 text-center text-slate-500 shadow-sm">
            Loading feed...
          </div>
        ) : feedView === 'discover' ? (
          <>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Trending</h3>
              {[...posts]
                .sort((a, b) => {
                  const aScore = (a.interactions?.likes ?? 0) + (a.interactions?.comments ?? 0) + (a.interactions?.shares ?? 0) + (a.interactions?.reposts ?? 0);
                  const bScore = (b.interactions?.likes ?? 0) + (b.interactions?.comments ?? 0) + (b.interactions?.shares ?? 0) + (b.interactions?.reposts ?? 0);
                  return bScore - aScore;
                })
                .slice(0, 5)
                .map((post) => (
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
                      <p className="text-sm text-slate-700">
                        <MentionText text={post.content} viewerId={user?.id} viewerUsername={user?.username} />
                      </p>
                      {post.tags?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {post.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {renderAttachments(post.attachments)}
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        {post.topic ? (
                          <span className="rounded-full bg-slate-50 px-3 py-1 font-semibold text-slate-600">Topic: {post.topic}</span>
                        ) : null}
                        {post.location ? (
                          <span className="rounded-full bg-slate-50 px-3 py-1 font-semibold text-slate-600">Location: {post.location}</span>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Recommended</h3>
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
                    <p className="text-sm text-slate-700">
                      <MentionText text={post.content} viewerId={user?.id} viewerUsername={user?.username} />
                    </p>
                    {post.tags?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {post.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {renderAttachments(post.attachments)}
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      {post.topic ? (
                        <span className="rounded-full bg-slate-50 px-3 py-1 font-semibold text-slate-600">Topic: {post.topic}</span>
                      ) : null}
                      {post.location ? (
                        <span className="rounded-full bg-slate-50 px-3 py-1 font-semibold text-slate-600">Location: {post.location}</span>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          posts.map((post) => (
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
                <p className="text-sm text-slate-700">
                  <MentionText text={post.content} viewerId={user?.id} viewerUsername={user?.username} />
                </p>
                {post.tags?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  {post.topic ? (
                    <span className="rounded-full bg-slate-50 px-3 py-1 font-semibold text-slate-600">Topic: {post.topic}</span>
                  ) : null}
                  {post.location ? (
                    <span className="rounded-full bg-slate-50 px-3 py-1 font-semibold text-slate-600">Location: {post.location}</span>
                  ) : null}
                </div>
                {renderAttachments(post.attachments)}
              </div>
              <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-slate-500">
                <button
                  onClick={() => toggleLikePost(post)}
                  className={`flex items-center gap-1 ${post.userState?.liked ? 'text-pink-600' : ''}`}
                >
                  <span>{post.userState?.liked ? 'Liked' : 'Like'}</span>
                  <span>({Number(post.interactions?.likes || 0)})</span>
                </button>
                <button onClick={() => repostPost(post)} className="flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Repost
                </button>
                <button onClick={() => sharePost(post)} className="flex items-center gap-1">
                  <Share2 className="h-3 w-3" />
                  Share
                </button>
                <button onClick={() => window.open(`/post/${post.id}`, '_self')} className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  View
                </button>
                {canManagePost(post) ? (
                  <>
                    <button onClick={() => beginEditPost(post)} className="flex items-center gap-1">
                      Edit
                    </button>
                    <button onClick={() => togglePinPost(post)} className="flex items-center gap-1">
                      {post.isPinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button onClick={() => deleteOwnPost(post)} className="flex items-center gap-1 text-rose-600">
                      Delete
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))
        )}
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
        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={adDraft.title}
            onChange={(e) => setAdDraft((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Ad title"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <select
            value={adDraft.objective}
            onChange={(e) =>
              setAdDraft((prev) => ({
                ...prev,
                objective: e.target.value as 'traffic' | 'messages',
                destinationType: e.target.value === 'messages' ? 'messages' : prev.destinationType
              }))
            }
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="traffic">Objective: Traffic</option>
            <option value="messages">Objective: Messages</option>
          </select>
          <input
            value={adDraft.destinationUrl}
            onChange={(e) => setAdDraft((prev) => ({ ...prev, destinationUrl: e.target.value }))}
            placeholder="Target URL (https://...)"
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
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {adDraft.media.map((media) => {
              const type = inferMediaType(media);
              return (
                <div
                  key={media.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{media.name || media.url.split('/').pop()}</span>
                    <button onClick={() => handleAdMediaRemove(media.id)} className="text-xs font-semibold text-red-500">
                      Remove
                    </button>
                  </div>
                  <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {type === 'video' ? (
                      <video src={media.url} className="h-40 w-full object-cover" controls />
                    ) : (
                      <img src={media.url} alt={media.name || 'Ad media'} className="h-40 w-full object-cover" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Where should the ad appear?</span>
            <span>Select up to {Math.max(1, Math.min(3, Number(adsConfig?.maxPlacementsPerAd ?? 3)))}</span>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {[
              { value: 'homepage', label: 'Homepage' },
              { value: 'homepage_feed', label: 'Homepage Feed' },
              { value: 'community_feed', label: 'Community Feed' },
              { value: 'forum_listing', label: 'Forum Listing' },
              { value: 'thread_detail', label: 'Thread Detail' },
              { value: 'chat_sidebar', label: 'Chat Side Bar' }
            ]
              .filter((option) => {
                const allowed = Array.isArray(adsConfig?.allowedPlacements)
                  ? adsConfig.allowedPlacements.map((entry: any) => String(entry || '').toLowerCase())
                  : [];
                return allowed.length === 0 || allowed.includes(option.value);
              })
              .map((option) => {
                const selected = adDraft.placements.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      const maxPlacements = Math.max(1, Math.min(3, Number(adsConfig?.maxPlacementsPerAd ?? 3)));
                      if (selected) {
                        setAdDraft((prev) => ({
                          ...prev,
                          placements: prev.placements.filter((placement) => placement !== option.value),
                          placement:
                            prev.placement === option.value
                              ? prev.placements.find((placement) => placement !== option.value) || 'community_feed'
                              : prev.placement
                        }));
                        return;
                      }
                      if (adDraft.placements.length >= maxPlacements) {
                        showNotification('warning', 'Ads', `You can select up to ${maxPlacements} placements.`);
                        return;
                      }
                      setAdDraft((prev) => ({
                        ...prev,
                        placements: [...prev.placements, option.value],
                        placement: prev.placements.length === 0 ? option.value : prev.placement
                      }));
                    }}
                    className={`rounded-2xl border px-3 py-2 text-left text-sm ${
                      selected
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
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
          <select
            value={adDraft.pricingModel}
            onChange={(e) => setAdDraft((prev) => ({ ...prev, pricingModel: e.target.value === 'CPC' ? 'CPC' : 'CPM' }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="CPM">Cost Per Mille (CPM)</option>
            <option value="CPC">Cost Per Click (CPC)</option>
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
          <input
            value={adDraft.ctaText}
            onChange={(e) => setAdDraft((prev) => ({ ...prev, ctaText: e.target.value }))}
            placeholder="CTA text (optional)"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            value={adDraft.targetCountries}
            onChange={(e) => setAdDraft((prev) => ({ ...prev, targetCountries: e.target.value }))}
            placeholder="Target countries (comma separated)"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <select
            value={adDraft.targetAudience}
            onChange={(e) =>
              setAdDraft((prev) => ({
                ...prev,
                targetAudience: e.target.value as 'users' | 'businesses' | 'all'
              }))
            }
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="users">Target Users</option>
            <option value="businesses">Target Company/Businesses</option>
            <option value="all">Target Everyone</option>
          </select>
          <input
            type="number"
            min={0}
            value={adDraft.dailySpend}
            onChange={(e) => setAdDraft((prev) => ({ ...prev, dailySpend: Number(e.target.value || 0) }))}
            placeholder="Daily spend"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              {adDraft.destinationType === 'messages'
                ? 'Users will message you directly from the ad.'
                : 'Users will be sent to the target URL.'}
            </span>
            <span>
              Rate:{' '}
              <strong>
                {adDraft.pricingModel === 'CPM'
                  ? `${adRateCard.cpm || 0} ${adDraft.currency}/1,000 views`
                  : `${adRateCard.cpc || 0} ${adDraft.currency}/click`}
              </strong>
            </span>
            <span>
              Estimated {adDraft.pricingModel === 'CPM' ? 'views' : 'clicks'}:{' '}
              <strong>{adDraft.pricingModel === 'CPM' ? estimatedImpressions : estimatedClicks}</strong>
            </span>
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
              <option value="">No active gateways configured</option>
            ) : (
              availableGateways.map((gateway) => (
                <option key={gateway.id} value={gateway.id}>
                  {getUserFacingPaymentMethodName(gateway)}
                </option>
              ))
            )}
          </select>
        </div>
        {availableGateways.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">
            No active gateways configured. Enable one in Admin - Payments - Gateways.
          </p>
        )}
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
            {ad.media?.length ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                {inferMediaType(ad.media[0]) === 'video' ? (
                  <video src={ad.media[0].url} controls className="h-44 w-full object-cover" />
                ) : (
                  <img src={ad.media[0].url} alt={ad.title || 'Ad media'} className="h-44 w-full object-cover" />
                )}
              </div>
            ) : null}
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="text-xs text-slate-500">
                Placement:{' '}
                {Array.isArray((ad as any)?.targeting?.placements) && (ad as any).targeting.placements.length
                  ? (ad as any).targeting.placements.join(', ')
                  : ad.placement}
              </div>
              <div className="text-xs text-slate-500">Budget: {ad.budget ?? ad.pendingBudget ?? 0} {ad.currency || 'USD'}</div>
              <div className="text-xs text-slate-500">Spent: {(Number(ad.budget || 0) - Number(ad.remainingBudget || 0)).toFixed(2)} {ad.currency || 'USD'}</div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="text-xs text-slate-500">Objective: {ad.objective || 'traffic'}</div>
              <div className="text-xs text-slate-500">CTA: {ad.ctaText || 'Default'}</div>
              <div className="text-xs text-slate-500">Messages started: {(ad as any).messagesStarted ?? 0}</div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div className="text-xs text-slate-500">Clicks: {ad.clicks ?? 0}</div>
              <div className="text-xs text-slate-500">Views: {ad.impressions ?? 0}</div>
              <div className="text-xs text-slate-500">Impressions: {ad.impressions ?? 0}</div>
              <div className="text-xs text-slate-500">Likes: {(ad as any).likes ?? 0}</div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="text-xs text-slate-500">
                Run: {ad.startAt ? new Date(ad.startAt).toLocaleDateString() : '--'} {'->'} {ad.endAt ? new Date(ad.endAt).toLocaleDateString() : '--'}
              </div>
              <div className="text-xs text-slate-500">
                Destination: {ad.destinationType === 'messages' ? 'Messages' : 'URL'}
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
        allowUpload
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
          <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-rose-700 p-4 text-white">
            <p className="text-xs uppercase tracking-widest">Signals</p>
            <p className="text-2xl font-bold">{insights.engagement}%</p>
            <p className="text-xs text-white/80">Community response</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 md:col-span-2">
            Trend details update once analytics data is available.
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
            <button
              type="button"
              onClick={openProfilePhotoPicker}
              className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Select photo
            </button>
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
            {followers.length === 0 && <p className="text-sm text-slate-500">No followers yet.</p>}
            {followers.slice(0, 6).map((profile) => (
              <div key={profile.id} className="flex items-center justify-between gap-3">
                <Link to={buildProfileUrl(profile)} className="flex min-w-0 items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-100 shrink-0">
                    {profile.avatar ? (
                      <img src={profile.avatar} alt={profile.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <Users className="mx-auto mt-2 h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{profile.name}</p>
                    <p className="truncate text-xs text-slate-500">@{profile.username || 'member'}</p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <Link to={buildProfileUrl(profile)} className="text-xs font-semibold text-slate-600">
                    View
                  </Link>
                  <button
                    onClick={() => handleBlockToggle(profile)}
                    disabled={Boolean(networkActionBusy[`block:${profile.id}`])}
                    className="text-xs font-semibold text-rose-600 disabled:opacity-60"
                  >
                    {profile.isBlocked ? 'Unblock' : 'Block'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Following</p>
          <div className="mt-3 space-y-3">
            {following.length === 0 && <p className="text-sm text-slate-500">Not following anyone yet.</p>}
            {following.slice(0, 6).map((profile) => (
              <div key={profile.id} className="flex items-center justify-between gap-3">
                <Link to={buildProfileUrl(profile)} className="flex min-w-0 items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-100 shrink-0">
                    {profile.avatar ? (
                      <img src={profile.avatar} alt={profile.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <Users className="mx-auto mt-2 h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{profile.name}</p>
                    <p className="truncate text-xs text-slate-500">@{profile.username || 'member'}</p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleUnfollow(profile)}
                    disabled={Boolean(networkActionBusy[`unfollow:${profile.id}`])}
                    className="text-xs font-semibold text-blue-600 disabled:opacity-60"
                  >
                    Unfollow
                  </button>
                  <button
                    onClick={() => handleBlockToggle(profile)}
                    disabled={Boolean(networkActionBusy[`block:${profile.id}`])}
                    className="text-xs font-semibold text-rose-600 disabled:opacity-60"
                  >
                    {profile.isBlocked ? 'Unblock' : 'Block'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Suggested creators</p>
          <div className="mt-3 space-y-3">
            {suggested.length === 0 && <p className="text-sm text-slate-500">No suggestions available right now.</p>}
            {suggested.slice(0, 8).map((profile) => (
              <div key={profile.id} className="flex items-center justify-between gap-3">
                <Link to={buildProfileUrl(profile)} className="flex min-w-0 items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-100 shrink-0">
                    {profile.avatar ? (
                      <img src={profile.avatar} alt={profile.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <Users className="mx-auto mt-2 h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{profile.name}</p>
                    <p className="truncate text-xs text-slate-500">@{profile.username || 'member'}</p>
                  </div>
                </Link>
                <button
                  onClick={handleSuggestedFollow(profile)}
                  disabled={Boolean(networkActionBusy[`follow:${profile.id}`])}
                  className={`text-xs font-semibold disabled:opacity-60 ${
                    profile.following ? 'text-slate-500' : 'text-blue-600'
                  }`}
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

  const renderGcoin = () => {
    const wallet = gcoinWallet || {};
    const transactions = Array.isArray(wallet.transactions) ? wallet.transactions : [];
    return (
      <section className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-wide text-slate-500">Gcoin wallet</p>
          <h2 className="text-2xl font-bold text-slate-900">Balance, rewards, and transfers</h2>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-400">Balance</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{wallet.balance ?? 0}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-400">Lifetime earned</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{wallet.lifetimeEarned ?? 0}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{wallet.status || 'active'}</p>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Recent transactions</h3>
          <div className="mt-4 space-y-3">
            {transactions.length === 0 ? (
              <p className="text-sm text-slate-500">No transactions yet.</p>
            ) : (
              transactions.slice(0, 6).map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  <span>{tx.reason || tx.type || 'Gcoin activity'}</span>
                  <span className="font-semibold">{tx.amount}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderEarnings = () => (
    <section className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-slate-500">Creator earnings</p>
        <h2 className="text-2xl font-bold text-slate-900">Revenue and reward summary</h2>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total earnings</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">${insights.earnings.toFixed(2)}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Gcoin earned</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{insights.gcoin}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Active ads</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{insights.activeAds}</p>
        </div>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">
          Detailed earnings statements appear once campaigns and rewards are finalized.
        </p>
      </div>
      <MonetizationPanel />
    </section>
  );

  const renderStories = () => (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Stories</p>
          <h2 className="text-2xl font-bold text-slate-900">Post short updates</h2>
        </div>
        <button
          onClick={() => setShowStoryMediaPicker(true)}
          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
        >
          Add media
        </button>
      </header>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <select
            value={storyDraft.type}
            onChange={(e) => setStoryDraft((prev) => ({ ...prev, type: e.target.value as any }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="text">Text story</option>
            <option value="image">Image story</option>
            <option value="video">Video story</option>
          </select>
          <select
            value={storyDraft.visibility}
            onChange={(e) => setStoryDraft((prev) => ({ ...prev, visibility: e.target.value as any }))}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="public">Visibility: Public</option>
            <option value="friends">Visibility: Friends</option>
            <option value="network">Visibility: Network</option>
            <option value="private">Visibility: Private</option>
            <option value="custom">Visibility: Custom</option>
          </select>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            {storyDraft.media ? `Media: ${storyDraft.media.name}` : 'No media selected.'}
          </div>
          {storyDraft.media?.url && storyDraft.type !== 'text' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              {inferMediaType(storyDraft.media) === 'video' ? (
                <video src={resolveAssetUrl(storyDraft.media.url)} controls className="h-48 w-full rounded-xl object-cover" />
              ) : (
                <img
                  src={resolveAssetUrl(storyDraft.media.url)}
                  alt={storyDraft.media.name || 'Story media'}
                  className="h-48 w-full rounded-xl object-cover"
                />
              )}
            </div>
          )}
        </div>
        <textarea
          value={storyDraft.content}
          onChange={(e) => setStoryDraft((prev) => ({ ...prev, content: e.target.value }))}
          placeholder="Write a short story (optional for media stories)."
          rows={3}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
        />
        {storyDraft.type === 'text' && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div
              className="flex h-44 w-full items-center justify-center rounded-2xl px-4 text-center text-sm font-semibold"
              style={{
                background: storyPreviewStyle.background,
                color: storyPreviewStyle.color,
                fontFamily: storyPreviewStyle.fontFamily,
                textAlign: storyPreviewStyle.textAlign as any
              }}
            >
              <span className="line-clamp-4 whitespace-pre-wrap">
                {storyDraft.content.trim() ? storyDraft.content : 'Type a story...'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {storyTextThemes.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() =>
                    setStoryDraft((prev) => ({
                      ...prev,
                      textBackground: theme.background,
                      textColor: theme.textColor
                    }))
                  }
                  className={`h-10 w-10 rounded-full border-2 ${storyDraft.textBackground === theme.background ? 'border-slate-900' : 'border-transparent'}`}
                  style={{ background: theme.background }}
                  title={theme.label}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {storyTextFonts.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => setStoryDraft((prev) => ({ ...prev, textFont: font.fontFamily }))}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${storyDraft.textFont === font.fontFamily ? 'border-slate-900 text-slate-900' : 'border-slate-200 text-slate-500'}`}
                  style={{ fontFamily: font.fontFamily }}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-end">
          <button
            onClick={handleStoryCreate}
            disabled={storyPosting}
            className="rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white"
          >
            {storyPosting ? 'Posting...' : 'Post story'}
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {stories.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            No stories yet.
          </div>
        ) : (
          stories.map((story: any) => (
            <div key={story.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{story.authorName || 'Community member'}</p>
                  <p className="text-xs text-slate-500">{story.createdAt ? new Date(story.createdAt).toLocaleString() : ''}</p>
                </div>
                {(story.authorId === user?.id || (user?.role || '').toLowerCase().includes('admin')) && (
                  <button onClick={() => handleStoryDelete(story.id)} className="text-xs font-semibold text-red-500">
                    Delete
                  </button>
                )}
              </div>
              {(() => {
                const mediaUrl = resolveAssetUrl(story.media?.url);
                if (mediaUrl) {
                  return story.type === 'video' ? (
                    <video src={mediaUrl} controls className="mt-3 w-full rounded-2xl" />
                  ) : (
                    <img src={mediaUrl} alt="Story media" className="mt-3 w-full rounded-2xl object-cover" />
                  );
                }
                if (story.content) {
                  const style = getStoryTextStyle(story);
                  return (
                    <div
                      className="mt-3 flex h-44 w-full items-center justify-center rounded-2xl px-4 text-center text-sm font-semibold"
                      style={{
                        background: style.background,
                        color: style.color,
                        fontFamily: style.fontFamily,
                        textAlign: style.textAlign as any
                      }}
                    >
                      <span className="line-clamp-4 whitespace-pre-wrap">{story.content}</span>
                    </div>
                  );
                }
                return null;
              })()}
              {story.content && story.media?.url && (
                <p className="mt-3 text-sm text-slate-700">{story.content}</p>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );

  const renderChats = () => (
    <section className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-slate-500">Community chats</p>
        <h2 className="text-2xl font-bold text-slate-900">Jump into your conversations</h2>
      </header>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">
          Open your existing messaging inbox to chat with community members.
        </p>
        <button
          onClick={() => (window.location.href = '/messages')}
          className="mt-4 rounded-2xl bg-slate-900 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white"
        >
          Go to messages
        </button>
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
          {businessPages.length === 0 && <option value="">No pages yet</option>}
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
        {!!business.id && (
          <button
            onClick={handleBusinessDelete}
            disabled={businessSaving}
            className="rounded-2xl border border-rose-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-600 disabled:opacity-60"
          >
            Delete page
          </button>
        )}
      </div>
      {!businessConfig.businessPagesEnabled && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Business pages are currently disabled by admin settings.
        </div>
      )}
      {!!business.id && business.status && business.status !== 'active' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          This page is currently <strong>{business.status}</strong>.
          {business.statusReason ? ` Reason: ${business.statusReason}` : ''}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="rounded-2xl border border-dashed border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Brand assets</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Logo</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-14 w-14 rounded-2xl bg-slate-100 overflow-hidden">
                  {business.logo?.url ? (
                    <img src={business.logo.url} alt="Logo" className="h-full w-full object-cover" />
                  ) : (
                    <Building2 className="mx-auto mt-4 h-6 w-6 text-slate-400" />
                  )}
                  </div>
                  <button
                    type="button"
                    onClick={openBusinessLogoPicker}
                    className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Select logo
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Cover image</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-14 flex-1 rounded-2xl bg-slate-100 overflow-hidden">
                    {business.cover?.url ? (
                      <img src={business.cover.url} alt="Cover" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">No cover</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={openBusinessCoverPicker}
                    className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Select cover
                  </button>
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
            placeholder="Scrolith address (e.g. arewa-express)"
          />
          <p className="text-xs text-slate-400">
            Your Scrolith address: Scrolith.com/company/{business.slug || toSlug(business.name || '') || 'your-business'}
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
          <button
            onClick={handleBusinessSave}
            disabled={
              businessSaving ||
              !businessConfig.businessPagesEnabled ||
              (!!business.id && ['banned', 'deleted'].includes(String(business.status || '').toLowerCase()))
            }
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
                {business.logo?.url ? (
                  <img src={business.logo.url} alt="Logo" className="h-full w-full object-cover" />
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
              <span>Followers: {business.followersCount || 0}</span>
              <span>Website: {business.website || 'N/A'}</span>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-slate-300">
              <span>Tag: #{business.slug || 'Scrolith'}</span>
              <span>Mention: @{business.slug || 'Scrolith'}</span>
            </div>
            <button
              onClick={handleBusinessFollowToggle}
              disabled={
                businessFollowBusy ||
                !business.id ||
                !businessConfig.businessPagesEnabled ||
                !businessConfig.businessPageFollowEnabled ||
                String(business.status || '').toLowerCase() !== 'active'
              }
              className="mt-2 w-full rounded-2xl bg-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
            >
              {businessFollowBusy ? 'Updating...' : business.isFollowing ? 'Unfollow page' : 'Follow page'}
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
      case 'overview':
        return renderInsights();
      case 'posts':
        return renderFeed();
      case 'followers':
        return renderNetwork();
      case 'gcoin':
        return renderGcoin();
      case 'earnings':
        return renderEarnings();
      case 'ads':
        return renderAds();
      case 'business':
        return renderBusiness();
      case 'stories':
        return renderStories();
      case 'chats':
        return renderChats();
      case 'settings':
        return renderProfile();
      default:
        return renderInsights();
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
              <p className="text-xs uppercase tracking-[0.4em] text-slate-200">Role</p>
              <p className="text-sm font-semibold">{user?.role || 'Community member'}</p>
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
      <FilePickerModal
        open={showPostMediaPicker}
        onClose={() => {
          setShowPostMediaPicker(false);
          setReplaceMediaId(null);
        }}
        onSelect={handlePostMediaSelected}
        onSelectMultiple={handlePostMediaSelectedMultiple}
        allowUpload
        allowCamera
        multiple={!replaceMediaId}
        filterType="all"
        acceptedTypes={['image', 'video', 'document']}
        title={replaceMediaId ? 'Replace post attachment' : 'Select post media'}
        role={user?.role}
        visibility="public"
      />
      <FilePickerModal
        open={Boolean(assetPickerTarget)}
        onClose={() => setAssetPickerTarget(null)}
        onSelect={handleAssetPickerSelect}
        allowUpload
        allowCamera
        multiple={false}
        filterType="image"
        acceptedTypes={['image']}
        title={
          assetPickerTarget === 'profile'
            ? 'Select profile photo'
            : assetPickerTarget === 'business-logo'
              ? 'Select business logo'
              : 'Select cover image'
        }
        role={user?.role}
        visibility="public"
      />
      <FilePickerModal
        open={showStoryMediaPicker}
        onClose={() => setShowStoryMediaPicker(false)}
        onSelect={handleStoryMediaSelected}
        allowUpload
        allowCamera
        multiple={false}
        filterType="all"
        acceptedTypes={['image', 'video']}
        title="Select story media"
        role={user?.role}
        visibility="public"
      />
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-6">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Live camera</h3>
            <div className="mt-4 overflow-hidden rounded-2xl bg-slate-900">
              <video ref={cameraVideoRef} autoPlay playsInline className="h-72 w-full object-cover" />
            </div>
            <canvas ref={cameraCanvasRef} className="hidden" />
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={stopCamera}
                className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={captureCameraPhoto}
                  className="rounded-2xl bg-slate-900 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white"
                >
                  Capture Photo
                </button>
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="rounded-2xl bg-red-600 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white"
                  >
                    Stop Recording
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="rounded-2xl border border-slate-300 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700"
                  >
                    Record Video
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default CommunityDashboard;
