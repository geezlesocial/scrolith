import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TrendingUp,
  Calendar,
  Award,
  ShieldAlert,
  MessageCircle,
  Filter,
  Search,
  Plus,
  Camera as CameraIcon,
  X,
  Repeat2,
  Send,
  Coins,
  Download,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLiveFeature } from '../context/LiveFeatureContext';
import { useUser } from '../context/UserContext';
import DonateButton from '../components/DonateButton';
import { CommunityService } from '../services/community';
import { AdService } from '../services/ads';
import { ScrollService, type ScrollConfig, type ScrollVideo } from '../services/scroll';
import { ReactionsService } from '../services/reactions';
import InlineAutoplayVideo from '../components/media/InlineAutoplayVideo';
import AdVideoPlayer from '../components/ads/AdVideoPlayer';
import MediaPreviewModal, { type PreviewMedia } from '../components/media/MediaPreviewModal';
import PostVideoActionBar from '../components/media/PostVideoActionBar';
import PostExpandModal from '../components/post/PostExpandModal';
import ScrollCreateModal from '../features/scroll/ScrollCreateModal';
import EnterpriseStoryViewer from '../features/stories/components/StoryViewer';
import LiveFeaturedRail from '../features/live/components/LiveFeaturedRail';
import ExpandablePreviewText from '../components/common/ExpandablePreviewText';
import StaticPreviewText from '../components/common/StaticPreviewText';
import ContentOfferTags from '../components/commerce/ContentOfferTags';
import PostHeader from './components/PostHeader';
import PostEngagementBar from './components/PostEngagementBar';
import MentionText from './components/MentionText';
import MentionHashtagTextarea from './components/MentionHashtagTextarea';
import FollowButton from './components/FollowButton';
import PostOptionsButton from './components/post-options/PostOptionsButton';
import { applyFollowUpdatePayload, resetFollowState, setFollowStatuses, useFollowStateMap } from './followState';
import { useNotification } from '../context/NotificationContext';
import { FileService } from '../services/files';
import { getDefaultStoryTextDraft, getStoryTextStyle, storyTextFonts, storyTextThemes } from './storyStyles';
import { resolveAssetUrl } from '../utils/assetUrl';
import {
  extractFeedItemList,
  extractHasMore,
  extractNextCursor,
  mergeUniqueFeedItems,
  shouldContinueOffsetFallback
} from '../utils/feedPagination';
import { resolveFeedTerminalState, shouldHaltEmptyPageLoop } from '../utils/continuousFeed';
import {
  getStableFeedReactKey,
  logFeedLifecycle,
  prependRealtimeItem,
  resolveTransportAfterFailure,
  shouldAllowObserverLoadMore,
  shouldSkipDuplicateCursorRequest,
  shouldStopUnchangedCursorLoop
} from '../utils/feedLifecycle';
import { Phase2Service } from '../services/phase2';
import { MemberFeedService } from '../services/memberFeed';
import { INLINE_VIDEO_PREVIEW_AUTOPLAY, resolveInlineMedia } from '../utils/inlineMedia';
import { resolvePostAttachmentMediaUrl, resolvePostAttachmentPosterUrl } from '../utils/postAttachmentMedia';
import { resolveUserAvatarUrl } from '../utils/userAvatar';
import { hydrateStoryAuthorAvatars } from '../utils/storyAuthorAvatarHydration';
import {
  buildPostVideoScrollViewerPath,
  stashPendingPostVideoScrollViewerSource,
  type PendingPostVideoScrollViewerSource
} from '../utils/postVideoScrollBridge';
import { buildPublicAppUrl } from '../utils/siteUrl';
import { downloadToDevice } from '../utils/deviceDownload';
import { Capacitor } from '@capacitor/core';
import { usePerformanceProfile } from '../hooks/usePerformanceProfile';
import { upsertImagePreloadLink } from '../utils/resourceHints';
import GraphicWarningGate from '../components/media/GraphicWarningGate';
import PostOriginPreview from '../components/post/PostOriginPreview';
import TranslatablePostText from '../components/translation/TranslatablePostText';
import AdCard from '../components/AdCard';
import StoryUploadStatusCard from '../components/stories/StoryUploadStatusCard';
import StoryAuthorAvatar from '../components/stories/StoryAuthorAvatar';
import SearchInput from '../components/SearchInput';
import OptimizedImage from '../components/media/OptimizedImage';
import { pickInterestSurveyCandidateIds } from '../components/recommendation/ContentInterestSurvey';
import { RecoService } from '../services/reco';
import {
  postAiInsightPreferenceToBoolean,
  resolvePostAiInsightPreference,
  resolveStoredPostAiInsightPreference,
  type PostAiInsightPreference
} from '../utils/postAiControls';
import { normalizeContentOfferTags } from '../utils/contentOffers';

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

const toPreviewMedia = (media: any): PreviewMedia | null => {
  const url = String(media?.url || '').trim();
  if (!url) return null;
  return {
    id: media?.id,
    url,
    name: media?.name,
    mimeType: media?.mimeType || media?.mime_type,
    type: media?.type,
    thumbnailUrl: media?.thumbnailUrl || media?.thumbnail_url || null,
    duration: media?.duration
  };
};

const extractCommunityFeedItems = (payload: any): any[] => extractFeedItemList(payload);

const extractCommunityFeedCursor = (payload: any): string | null => extractNextCursor(payload);

const GRAPHIC_WARNING_LABEL = 'Graphic warning';
const FEED_SINGLE_MEDIA_HEIGHT_CLASS = 'h-[20rem] sm:h-[24rem] lg:h-[28rem]';
const FEED_MULTI_MEDIA_HEIGHT_CLASS = 'h-[15rem] sm:h-[18rem] lg:h-[22rem]';

const formatRelativeTime = (value: string | Date | null | undefined) => {
  if (!value) return 'recently';
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'recently';
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

const formatCompactCount = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0';
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1).replace(/\.0$/, '')}M+`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1).replace(/\.0$/, '')}k+`;
  return String(Math.trunc(numeric));
};

type ViewportDevice = 'mobile' | 'tablet' | 'desktop';

const getViewportDevice = (width: number): ViewportDevice => {
  if (!Number.isFinite(width)) return 'desktop';
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

const isVisibleForDevice = (visibility: any, device: ViewportDevice) => {
  if (!visibility || typeof visibility !== 'object') return true;
  return visibility?.[device] !== false;
};

const isModuleEnabled = (modules: any, key: string, device: ViewportDevice) => {
  const mod = modules?.[key];
  if (mod?.enabled === false) return false;
  return isVisibleForDevice(mod?.visibility, device);
};

const getModuleTitle = (modules: any, key: string, fallback: string) => {
  const raw = String(modules?.[key]?.title || '').trim();
  return raw || fallback;
};

const commentPolicyOptions = [
  { value: 'everyone', label: 'Everyone can comment' },
  { value: 'followers', label: 'Followers can comment' },
  { value: 'following', label: 'People you follow can comment' },
  { value: 'mutuals', label: 'Mutual followers can comment' },
  { value: 'none', label: 'Disable comments' }
];

const parseList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const sumReactionCounts = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (!value || typeof value !== 'object') return 0;
  return Object.values(value as Record<string, unknown>).reduce<number>((total, count) => {
    const numeric = Number(count);
    if (!Number.isFinite(numeric)) return total;
    return total + Math.max(0, Math.trunc(numeric));
  }, 0);
};

const isPrivilegedRole = (role?: string) => {
  const normalized = String(role || '').toLowerCase();
  return normalized.includes('admin') || normalized === 'moderator';
};

type StoryVisibility = 'public' | 'followers' | 'following' | 'mutuals' | 'network' | 'private' | 'custom';
type StoryKind = 'text' | 'image' | 'video';

const storyVisibilityOptions: Array<{ value: StoryVisibility; label: string }> = [
  { value: 'public', label: 'Public' },
  { value: 'followers', label: 'Followers' },
  { value: 'following', label: 'Following' },
  { value: 'mutuals', label: 'Mutuals' },
  { value: 'network', label: 'Network' },
  { value: 'private', label: 'Private' }
];

const normalizeStoryVisibility = (value?: string): StoryVisibility => {
  const normalized = (value || '').toLowerCase();
  if (storyVisibilityOptions.some((option) => option.value === normalized)) {
    return normalized as StoryVisibility;
  }
  if (normalized === 'friends') return 'mutuals';
  return 'public';
};

const isPrivateStoryVisibility = (value?: StoryVisibility) => value === 'private' || value === 'custom';

const resolveStoryType = (story: any): StoryKind => {
  const raw = String(story?.type || story?.storyType || story?.media?.type || '').trim().toLowerCase();
  if (raw === 'video') return 'video';
  if (raw === 'image') return 'image';
  const media = resolveInlineMedia(story, { typeHint: raw || story?.type });
  if (media.kind === 'video') return 'video';
  if (media.kind === 'image') return 'image';
  return 'text';
};

const resolveStoryMedia = (story: any) => resolveInlineMedia(story, { typeHint: story?.type });
const resolveStoryMediaUrl = (story: any) => (resolveStoryType(story) === 'text' ? '' : resolveStoryMedia(story).src);
const resolveStoryContent = (story: any) =>
  story?.content ||
  story?.text ||
  story?.caption ||
  story?.storyText ||
  story?.story_text ||
  '';

const resolveStoryAuthorName = (story: any, fallback = 'Community') => {
  const raw =
    story?.authorName ||
    story?.author?.displayName ||
    story?.author?.name ||
    story?.authorUsername ||
    story?.author?.username ||
    story?.userName ||
    story?.user_name ||
    '';
  const normalized = String(raw || '').trim();
  return normalized || fallback;
};

const resolveViewerProfileAvatar = (story: any, viewer?: any) => {
  if (!story || !viewer) return '';
  const normalizeOwnerToken = (value: unknown) => String(value || '').trim().replace(/^@+/, '').toLowerCase();
  const storyOwnerTokens = [
    story?.authorId,
    story?.userId,
    story?.user_id,
    story?.author?.id,
    story?.authorUsername,
    story?.author?.username,
    story?.userName,
    story?.user_name,
    story?.user?.username,
    story?.authorName,
    story?.author?.displayName,
    story?.author?.name,
    story?.user?.displayName,
    story?.user?.name
  ].map(normalizeOwnerToken).filter(Boolean);
  const viewerTokens = [
    viewer?.id,
    viewer?.user_id,
    viewer?.username,
    viewer?.user_name,
    viewer?.name,
    viewer?.email
  ].map(normalizeOwnerToken).filter(Boolean);
  if (!storyOwnerTokens.some((token) => viewerTokens.includes(token))) return '';

  const viewerAvatar = resolveUserAvatarUrl(viewer);
  if (viewerAvatar) return viewerAvatar;

  const viewerProfilePhotoFileId = String(
    viewer?.profilePhotoFileId || viewer?.profile_photo_file_id || viewer?.avatarFileId || viewer?.avatar_file_id || ''
  ).trim();
  if (viewerProfilePhotoFileId) return resolvePostAttachmentMediaUrl({ fileId: viewerProfilePhotoFileId });

  return '';
};

const resolveStoryAuthorAvatar = (story: any, viewer?: any) => {
  const directAvatar = String(
    story?.authorAvatar ||
      story?.author_avatar ||
      story?.avatarUrl ||
      story?.avatar_url ||
      story?.author?.avatarUrl ||
      story?.author?.avatar ||
      story?.userAvatar ||
      story?.user_avatar ||
      story?.user?.avatarUrl ||
      story?.user?.avatar ||
      story?.authorPhoto ||
      story?.author_photo ||
      ''
  ).trim();
  if (
    directAvatar &&
    (/^(https?:|data:|blob:|\/|uploads\/)/i.test(directAvatar) ||
      directAvatar.includes('/uploads/') ||
      /\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(directAvatar))
  ) {
    return resolvePostAttachmentMediaUrl({ url: directAvatar });
  }

  const profilePhotoFileId = String(
    story?.authorAvatarFileId ||
      story?.author_avatar_file_id ||
      story?.profilePhotoFileId ||
      story?.profile_photo_file_id ||
      story?.avatarFileId ||
      story?.avatar_file_id ||
      story?.author?.profilePhotoFileId ||
      story?.author?.profile_photo_file_id ||
      story?.author?.avatarFileId ||
      story?.author?.avatar_file_id ||
      story?.user?.profilePhotoFileId ||
      story?.user?.profile_photo_file_id ||
      story?.user?.avatarFileId ||
      story?.user?.avatar_file_id ||
      ''
  ).trim();
  if (profilePhotoFileId) {
    return resolvePostAttachmentMediaUrl({ fileId: profilePhotoFileId });
  }

  return resolveUserAvatarUrl({
    ...story,
    ...(story?.author || {}),
    avatarUrl:
      story?.authorAvatar ||
      story?.author_avatar ||
      story?.avatarUrl ||
      story?.avatar_url ||
      story?.author?.avatarUrl ||
      story?.userAvatar ||
      story?.user_avatar ||
      story?.user?.avatarUrl,
    avatar:
      story?.avatar ||
      story?.author?.avatar ||
      story?.user?.avatar ||
      story?.authorPhoto ||
      story?.author_photo,
    profilePhotoFileId:
      story?.authorAvatarFileId ||
      story?.author_avatar_file_id ||
      story?.profilePhotoFileId ||
      story?.author?.profilePhotoFileId ||
      story?.user?.profilePhotoFileId,
    profile_photo_file_id:
      story?.profile_photo_file_id ||
      story?.author?.profile_photo_file_id ||
      story?.user?.profile_photo_file_id,
    avatarFileId: story?.avatarFileId || story?.author?.avatarFileId || story?.user?.avatarFileId,
    avatar_file_id: story?.avatar_file_id || story?.author?.avatar_file_id || story?.user?.avatar_file_id
  }) || resolveViewerProfileAvatar(story, viewer);
};

const resolveStoryAuthorInitial = (story: any) => {
  const first = resolveStoryAuthorName(story, 'S').replace(/^@+/, '').trim().charAt(0).toUpperCase();
  return first || 'S';
};

const isStoryActive = (story: any) => {
  if (!story?.expiresAt) return true;
  const expiresAt = new Date(story.expiresAt).getTime();
  return Number.isNaN(expiresAt) ? true : expiresAt > Date.now();
};

const resolveReelMedia = (scroll: ScrollVideo) => resolveInlineMedia(scroll?.media || scroll, { typeHint: 'video' });

const resolveReelAuthorName = (scroll: ScrollVideo, fallback = 'Scrolith') => {
  const normalized = String(scroll?.author?.name || '').trim();
  return normalized || fallback;
};

const resolveReelAuthorAvatar = (scroll: ScrollVideo) => {
  const normalized = String(scroll?.author?.avatar || '').trim();
  return normalized ? resolveAssetUrl(normalized) : '';
};

const resolveReelAuthorInitial = (scroll: ScrollVideo) => {
  const first = resolveReelAuthorName(scroll, 'S').replace(/^@+/, '').trim().charAt(0).toUpperCase();
  return first || 'S';
};

type PostDraft = {
  title: string;
  content: string;
  tags: string;
  mentions: string;
  topic: string;
  location: string;
  visibility: 'public' | 'friends' | 'network' | 'private' | 'custom';
  commentPolicy: 'everyone' | 'followers' | 'following' | 'mutuals' | 'none';
  graphicWarning: boolean;
  isAIEnhanced: boolean;
  aiInsightPreference: PostAiInsightPreference;
  media: Array<{
    localId: string;
    id?: string;
    url: string;
    name?: string;
    type?: 'image' | 'video' | 'document';
  }>;
};

const CommunityHome = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { status: liveFeatureStatus } = useLiveFeature();
  const params = useParams<{ id?: string }>();
  const focusPostId = String(params.id || '').trim();
  const focusQuery = new URLSearchParams(location.search);
  const focusCommentId = String(focusQuery.get('comment') || '').trim();
  const focusMentionToken = String(focusQuery.get('mention') || '').trim();
  const focusEditRaw = String(focusQuery.get('edit') || '').trim().toLowerCase();
  const shouldAutoEdit = ['1', 'true', 'yes', 'on'].includes(focusEditRaw);
  const [trendingTopics, setTrendingTopics] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [topContributors, setTopContributors] = useState<any[]>([]);
  const [recommendedCommunityPeople, setRecommendedCommunityPeople] = useState<any[]>([]);
  const [recommendedCommunityPages, setRecommendedCommunityPages] = useState<any[]>([]);
  const [pageFollowBusy, setPageFollowBusy] = useState<Record<string, boolean>>({});
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [communityStats, setCommunityStats] = useState({
    members: 0,
    discussions: 0,
    topics: 0,
    events: 0
  });
  const [posts, setPosts] = useState<any[]>([]);
  const [postsNextCursor, setPostsNextCursor] = useState<string | null>(null);
  const [postsOffsetFallbackEnabled, setPostsOffsetFallbackEnabled] = useState(false);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const [postsFeedTerminal, setPostsFeedTerminal] = useState(false);
  const postsEmptyPageStreakRef = useRef(0);
  const discoverySupplementUsedRef = useRef(false);
  /** Phase 3: orchestrated member-feed with Phase 1 continuous-feed fallback. */
  const postsTransportRef = useRef<'orchestrated' | 'legacy'>('legacy');
  const postsOrchestratedFailedRef = useRef(false);
  const postsNextCursorRef = useRef<string | null>(null);
  const postsOffsetFallbackRef = useRef(false);
  const postsFeedTerminalRef = useRef(false);
  const postsInFlightCursorRef = useRef<string | null>(null);
  const postsLastCompletedCursorRef = useRef<string | null>(null);
  const postsLastCompletedAddedRef = useRef(0);
  const postsInitialLoadingRef = useRef(false);
  const [insightCollapsedByPost, setInsightCollapsedByPost] = useState<Record<string, boolean>>({});
  const [revealedGraphicPosts, setRevealedGraphicPosts] = useState<Record<string, boolean>>({});
  const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null);
  const [expandedPost, setExpandedPost] = useState<any | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<PostDraft | null>(null);
  const [postActionBusy, setPostActionBusy] = useState<Record<string, boolean>>({});
  const [ads, setAds] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [reels, setReels] = useState<ScrollVideo[]>([]);
  const [reelsLoading, setReelsLoading] = useState(false);
  const [scrollConfig, setScrollConfig] = useState<ScrollConfig | null>(null);
  const [scrollCreateOpen, setScrollCreateOpen] = useState(false);
  const [storyRailTab, setStoryRailTab] = useState<'stories' | 'reels'>('stories');
  const [storyTextOpen, setStoryTextOpen] = useState(false);
  const [storyPosting, setStoryPosting] = useState(false);
  const [storyMediaUploadBusy, setStoryMediaUploadBusy] = useState(false);
  const [storyMediaUploadLabel, setStoryMediaUploadLabel] = useState('');
  const [storyMediaUploadProgress, setStoryMediaUploadProgress] = useState(0);
  const [activeStory, setActiveStory] = useState<any | null>(null);
  const [storyEditOpen, setStoryEditOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<any | null>(null);
  const [storyEditSaving, setStoryEditSaving] = useState(false);
  const [storyActionBusy, setStoryActionBusy] = useState<Record<string, boolean>>({});
  const [storyCameraOpen, setStoryCameraOpen] = useState(false);
  const [storyCameraStream, setStoryCameraStream] = useState<MediaStream | null>(null);
  const storyVideoRef = useRef<HTMLVideoElement | null>(null);
  const storyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const storyDeviceInputRef = useRef<HTMLInputElement | null>(null);
  const storyCameraInputRef = useRef<HTMLInputElement | null>(null);
  const storyRecorderRef = useRef<MediaRecorder | null>(null);
  const storyChunksRef = useRef<Blob[]>([]);
  const [storyRecording, setStoryRecording] = useState(false);
  const [storyDraft, setStoryDraft] = useState({
    content: '',
    visibility: 'public' as StoryVisibility,
    ...getDefaultStoryTextDraft()
  });
  const [storyEditDraft, setStoryEditDraft] = useState({
    content: '',
    visibility: 'public' as StoryVisibility,
    ...getDefaultStoryTextDraft()
  });
  const [homepage, setHomepage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewportDevice, setViewportDevice] = useState<ViewportDevice>(() => {
    if (typeof window === 'undefined') return 'desktop';
    return getViewportDevice(window.innerWidth);
  });
  const { user } = useUser();
  const { showNotification } = useNotification();
  const { profile } = usePerformanceProfile();
  const followStateMap = useFollowStateMap();
  const impressionTracked = useRef<Set<string>>(new Set());
  const viewTracked = useRef<Set<string>>(new Set());
  const postMediaTapTimersRef = useRef<Record<string, number>>({});
  const postMediaLastTapAtRef = useRef<Record<string, number>>({});
  const postsSentinelRef = useRef<HTMLDivElement | null>(null);
  const postsRef = useRef<any[]>([]);
  const postsLoadingMoreRef = useRef(false);
  const storyPreviewStyle = getStoryTextStyle(storyDraft);
  const storyEditPreviewStyle = getStoryTextStyle(storyEditDraft);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  const findPrimaryVideoAttachment = useCallback((post: any) => {
    const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
    return (
      attachments.find((entry: any) => {
        const type = inferMediaType(entry || {});
        return type === 'video';
      }) || null
    );
  }, []);

  const openVideoPostInScroll = useCallback(
    (post: any, media: any) => {
      const postId = String(post?.id || '').trim();
      const mediaUrl = String(resolvePostAttachmentMediaUrl(media) || resolveAssetUrl(media?.url) || '').trim();
      if (!postId || !mediaUrl) return;
      const sourcePayload: PendingPostVideoScrollViewerSource = {
        sourcePostId: postId,
        fileId: String(media?.fileId || media?.file_id || media?.file?.id || media?.asset?.id || media?.id || '').trim() || null,
        mediaUrl,
        thumbnailUrl: String(resolvePostAttachmentPosterUrl(media) || media?.thumbnailUrl || '').trim() || null,
        title: String(post?.title || '').trim() || null,
        description: String(post?.content || '').trim() || null,
        location: String(post?.location || '').trim() || null,
        authorName: String(post?.author?.displayName || post?.authorName || '').trim() || null,
        authorAvatar: String(resolveUserAvatarUrl(post?.author || post) || post?.authorAvatar || '').trim() || null,
        authorUsername: String(post?.author?.username || post?.authorUsername || '').trim() || null,
        isFollowingAuthor:
          typeof post?.viewer?.isFollowingAuthor === 'boolean' ? Boolean(post.viewer.isFollowingAuthor) : null,
        createdAt: String(post?.createdAt || '').trim() || null
      };
      stashPendingPostVideoScrollViewerSource(sourcePayload);
      navigate(buildPostVideoScrollViewerPath(sourcePayload), {
        state: {
          pendingViewerSource: sourcePayload
        }
      });
    },
    [navigate]
  );

  const openPostCard = useCallback(
    (post: any) => {
      if (!post?.id) return;
      const primaryVideo = findPrimaryVideoAttachment(post);
      if (primaryVideo) {
        openVideoPostInScroll(post, primaryVideo);
        return;
      }
      setExpandedPost(post);
    },
    [findPrimaryVideoAttachment, openVideoPostInScroll]
  );

  const openPostFromText = useCallback(
    (event: React.MouseEvent<HTMLElement>, post: any) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('a, button, input, textarea, select, label, video, audio')) return;
      openPostCard(post);
    },
    [openPostCard]
  );

  const triggerPostDoubleTapLike = useCallback(
    async (post: any) => {
      const postId = String(post?.id || '').trim();
      if (!postId) return;
      if (!user?.id) {
        if (confirm('Log in to like posts?')) window.location.href = '/auth/login';
        return;
      }
      try {
        const summary = await ReactionsService.react('POST', postId, 'like');
        window.dispatchEvent(
          new CustomEvent('community:post_reaction_updated', {
            detail: {
              postId,
              reactions: summary?.counts || {},
              actorId: user.id,
              userReaction: summary?.userReaction || null
            }
          })
        );
      } catch (error) {
        console.error('Failed to apply double-tap like', error);
      }
    },
    [user?.id]
  );

  const handlePostMediaPrimaryAction = useCallback(
    (post: any, media: any) => {
      const type = inferMediaType(media || {});
      if (type === 'video') {
        openVideoPostInScroll(post, media);
        return;
      }
      const preview = toPreviewMedia({
        ...media,
        url: resolvePostAttachmentMediaUrl(media) || resolveAssetUrl(media?.url) || media?.url,
        thumbnailUrl: resolvePostAttachmentPosterUrl(media) || media?.thumbnailUrl
      });
      if (preview) {
        setPreviewMedia(preview);
        return;
      }
      setExpandedPost(post);
    },
    [openVideoPostInScroll]
  );

  const queueOpenPostFromMediaTap = useCallback(
    (post: any, media: any, mediaKey: string) => {
      const postId = String(post?.id || '').trim();
      if (!postId) return;
      const timerKey = `${postId}:${mediaKey}`;
      const existing = postMediaTapTimersRef.current[timerKey];
      if (existing) window.clearTimeout(existing);
      postMediaTapTimersRef.current[timerKey] = window.setTimeout(() => {
        delete postMediaTapTimersRef.current[timerKey];
        handlePostMediaPrimaryAction(post, media);
      }, 220);
    },
    [handlePostMediaPrimaryAction]
  );

  const onPostMediaDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>, post: any, mediaKey: string) => {
      event.preventDefault();
      event.stopPropagation();
      const postId = String(post?.id || '').trim();
      if (!postId) return;
      const timerKey = `${postId}:${mediaKey}`;
      const existing = postMediaTapTimersRef.current[timerKey];
      if (existing) {
        window.clearTimeout(existing);
        delete postMediaTapTimersRef.current[timerKey];
      }
      void triggerPostDoubleTapLike(post);
    },
    [triggerPostDoubleTapLike]
  );

  const onPostMediaTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLElement>, post: any, mediaKey: string) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select, label')) return;
      const postId = String(post?.id || '').trim();
      if (!postId) return;
      const tapKey = `${postId}:${mediaKey}`;
      const now = Date.now();
      const previousTap = postMediaLastTapAtRef.current[tapKey] || 0;
      postMediaLastTapAtRef.current[tapKey] = now;
      if (previousTap && now - previousTap <= 320) {
        event.preventDefault();
        event.stopPropagation();
        const existing = postMediaTapTimersRef.current[tapKey];
        if (existing) {
          window.clearTimeout(existing);
          delete postMediaTapTimersRef.current[tapKey];
        }
        postMediaLastTapAtRef.current[tapKey] = 0;
        void triggerPostDoubleTapLike(post);
      }
    },
    [triggerPostDoubleTapLike]
  );

  const buildContributorUrl = useCallback((entry?: any) => {
    const handle = String(entry?.username || entry?.userName || '').trim().replace(/^@+/, '');
    if (handle) return `/u/${encodeURIComponent(handle)}`;
    const id = String(entry?.id || entry?.userId || '').trim();
    return id ? `/profile/${encodeURIComponent(id)}` : '/community';
  }, []);

  const buildCommunityPageUrl = useCallback((page?: any) => {
    const slug = String(page?.slug || page?.handle || page?.username || '').trim().replace(/^@+/, '');
    if (slug) return `/company/${encodeURIComponent(slug)}`;
    const id = String(page?.id || page?.pageId || '').trim();
    return id ? `/community/pages/${encodeURIComponent(id)}` : '/community';
  }, []);

  const handleCommunityPageFollow = useCallback(async (page: any) => {
    const pageId = String(page?.id || page?.pageId || '').trim();
    if (!pageId) return;
    if (!user?.id) {
      if (confirm('Log in to follow pages?')) window.location.href = '/auth/login';
      return;
    }
    if (pageFollowBusy[pageId]) return;
    const wasFollowing = Boolean(page?.isFollowing);
    setPageFollowBusy((prev) => ({ ...prev, [pageId]: true }));
    setRecommendedCommunityPages((prev) =>
      prev.map((item) => (String(item?.id || '') === pageId ? { ...item, isFollowing: !wasFollowing } : item))
    );
    try {
      if (wasFollowing && page?.followId) {
        await CommunityService.unfollowTarget(String(page.followId));
      } else if (!wasFollowing) {
        const response = await CommunityService.followTarget({ targetType: 'page', targetId: pageId });
        const followId = response?.id || response?.followId || response?.data?.id || null;
        setRecommendedCommunityPages((prev) =>
          prev.map((item) => (String(item?.id || '') === pageId ? { ...item, isFollowing: true, followId } : item))
        );
      }
    } catch (error) {
      setRecommendedCommunityPages((prev) =>
        prev.map((item) => (String(item?.id || '') === pageId ? { ...item, isFollowing: wasFollowing } : item))
      );
      console.error('Failed to update page follow status', error);
    } finally {
      setPageFollowBusy((prev) => ({ ...prev, [pageId]: false }));
    }
  }, [pageFollowBusy, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportDevice(getViewportDevice(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!focusPostId || !posts.length) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(`community-post-${focusPostId}`);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('ring-2', 'ring-blue-300');
      window.setTimeout(() => {
        target.classList.remove('ring-2', 'ring-blue-300');
      }, 3500);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusPostId, posts]);

  const normalizePost = useCallback((post: any) => {
    const interactions = { ...(post.interactions || {}) };
    if (interactions.likes === undefined) interactions.likes = post.likesCount ?? post.likes_count ?? 0;
    if (interactions.comments === undefined) interactions.comments = post.commentsCount ?? post.comments_count ?? 0;
    if (interactions.reposts === undefined) interactions.reposts = post.repostsCount ?? post.reposts_count ?? 0;
    if (interactions.shares === undefined) interactions.shares = post.sharesCount ?? post.shares_count ?? 0;
    if (interactions.views === undefined) interactions.views = post.viewsCount ?? post.views_count ?? 0;
    if (interactions.reactions === undefined) interactions.reactions = post.reactions || {};
    if (interactions.dashGcoinTotal === undefined) interactions.dashGcoinTotal = post.dashGcoinTotal ?? post.dash_gcoin_total ?? 0;
    const authorId = post.authorId || post.userId || post.user_id || post.author?.id || post.author?.userId || post.author?.user_id;
    const authorName = post.authorName || post.userName || post.user_name || post.author?.displayName || post.author?.name || 'Community member';
    const authorUsername =
      post.authorUsername ||
      post.userUsername ||
      post.user_username ||
      post.author?.username ||
      post.author?.userName ||
      post.author?.user_name ||
      null;
    const authorAvatar = resolveUserAvatarUrl(post.author || post) || post.authorAvatar || post.userAvatar || post.user_avatar || post.author?.avatarUrl || post.author?.avatar || '';
    const authorType = post.author?.type || (post.businessPage ? 'business' : 'user');
    const authorUserId =
      post.authorUserId ||
      post.author_user_id ||
      post.author?.userId ||
      post.author?.user_id ||
      (authorType === 'user' ? authorId : null);

    return {
      id: post.id || `${authorId}-${Date.now()}`,
      title: post.title,
      content: post.content,
    attachments: (post.attachments || []).map((item: any) => ({
      id: item.id || item.fileId || item.file_id || resolvePostAttachmentMediaUrl(item),
      fileId: item.fileId || item.file_id || item.file?.id || item.asset?.id || item.id || null,
      url: resolvePostAttachmentMediaUrl(item),
      name: item.name || item.originalName || item.filename,
      mimeType: item.mimeType || item.mime_type,
        type: item.type || inferMediaType(item),
        thumbnailUrl: resolvePostAttachmentPosterUrl(item),
        duration: item.duration,
        width: item.width,
        height: item.height
      })),
      author: {
        id: post.author?.id || (authorType === 'business' ? post.businessPage?.id : authorId),
        username: post.author?.username ?? authorUsername,
        displayName: post.author?.displayName || authorName,
        avatarUrl: resolveUserAvatarUrl(post.author || post) || authorAvatar,
        type: authorType,
        businessSlug: post.author?.businessSlug || post.businessPage?.slug || null,
        isVerified: Boolean(post.author?.isVerified),
        isPro: Boolean(post.author?.isPro)
      },
      viewer: {
        isFollowingAuthor: post.viewer?.isFollowingAuthor
      },
      authorId,
      authorUserId,
      authorName,
      authorUsername,
      authorAvatar,
      createdAt: post.createdAt || post.created_at,
      updatedAt: post.updatedAt || post.updated_at,
      tags: post.tags || [],
      mentions: post.mentions || [],
      topic: post.topic || null,
      location: post.location || null,
      visibility: post.visibility,
      commentPolicy: post.commentPolicy || post.comment_policy || 'everyone',
      repostsEnabled: post.repostsEnabled ?? post.reposts_enabled ?? true,
      isPinned: post.isPinned ?? post.is_pinned ?? false,
      isHighlighted: post.isHighlighted ?? post.is_highlighted ?? false,
      graphicWarning: Boolean(post.graphicWarning ?? post.graphic_warning ?? false),
      isAIEnhanced: Boolean(post.isAIEnhanced ?? post.is_ai_enhanced ?? false),
      offerTags: normalizeContentOfferTags(post.offerTags ?? post.offer_tags),
      originalPost:
        post.originalPost && typeof post.originalPost === 'object'
          ? {
              id: post.originalPost.id,
              authorName: post.originalPost.authorName ?? post.originalPost.author_name ?? null,
              authorUsername: post.originalPost.authorUsername ?? post.originalPost.author_username ?? null,
              title: post.originalPost.title ?? null,
              content: post.originalPost.content ?? null
            }
          : null,
      dashGcoinTotal: Number(post.dashGcoinTotal ?? post.dash_gcoin_total ?? interactions.dashGcoinTotal ?? 0),
      aiInsightEnabled: Boolean(post.aiInsightEnabled ?? post.ai_insight_enabled ?? false),
      aiInsightGenerated: Boolean(
        post.aiInsightGenerated ??
          post.ai_insight_generated ??
          (String(post.aiInsightText ?? post.ai_insight_text ?? '').trim() ? true : false)
      ),
      aiInsightText: String(post.aiInsightText ?? post.ai_insight_text ?? '').trim() || null,
      aiScore:
        post.aiScore !== undefined && post.aiScore !== null
          ? Number(post.aiScore)
          : post.ai_score !== undefined && post.ai_score !== null
            ? Number(post.ai_score)
            : null,
      likesCount: post.likesCount ?? post.likes_count ?? interactions.likes,
      sharesCount: post.sharesCount ?? post.shares_count ?? interactions.shares,
      repostsCount: post.repostsCount ?? post.reposts_count ?? interactions.reposts,
      interactions,
      userState: post.userState || post.user_state || {},
      ranking: post.ranking
        ? {
            mode: post.ranking.mode,
            recipeKey: post.ranking.recipeKey ?? post.ranking.recipe_key ?? null,
            score: Number(post.ranking.score ?? 0),
            primaryReason: post.ranking.primaryReason || post.ranking.primary_reason || null,
            reasons: Array.isArray(post.ranking.reasons) ? post.ranking.reasons : []
          }
        : post.rankingScore != null
          ? { score: Number(post.rankingScore), primaryReason: null, reasons: [] }
          : undefined
    };
  }, []);

  const sortPosts = useCallback((items: any[]) => {
    // Preserve server personalization when ranking scores are present.
    // Fall back to recency so unranked/offset pages remain stable.
    return [...items].sort((a, b) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
        return a.isPinned ? -1 : 1;
      }
      if (Boolean(a.isHighlighted) !== Boolean(b.isHighlighted)) {
        return a.isHighlighted ? -1 : 1;
      }
      const scoreA = Number(a?.ranking?.score ?? a?.rankingScore ?? Number.NaN);
      const scoreB = Number(b?.ranking?.score ?? b?.rankingScore ?? Number.NaN);
      const hasScoreA = Number.isFinite(scoreA);
      const hasScoreB = Number.isFinite(scoreB);
      if (hasScoreA || hasScoreB) {
        if (hasScoreA && hasScoreB && scoreB !== scoreA) return scoreB - scoreA;
        if (hasScoreA !== hasScoreB) return hasScoreA ? -1 : 1;
      }
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });
  }, []);

  const filterActiveStories = useCallback((items: any[]) => items.filter(isStoryActive), []);

  const canManageStory = useCallback((story: any) => {
    if (!user) return false;
    const authorId = story?.authorId || story?.userId || story?.user_id;
    if (authorId && String(authorId) === String(user.id)) return true;
    return isPrivilegedRole(user?.role);
  }, [user]);

  const applyStoryUpdate = useCallback((updated: any) => {
    if (!updated?.id) return;
    setStories((prev) => {
      const exists = prev.some((story) => story.id === updated.id);
      const next = exists
        ? prev.map((story) => (story.id === updated.id ? { ...story, ...updated } : story))
        : [updated, ...prev];
      return filterActiveStories(next);
    });
    setActiveStory((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
    setStoryActionTarget((current) =>
      current?.id === updated.id
        ? {
            ...current,
            ...updated,
            interactions: {
              ...(current?.interactions || {}),
              ...(updated?.interactions || {})
            }
          }
        : current
    );
  }, [filterActiveStories]);

  const syncCommentCount = useCallback((postId: string, nextCount: unknown) => {
    const parsed = Number(nextCount);
    const normalizedCount = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
    setCommentCounts((prev) => {
      if ((prev[postId] ?? 0) === normalizedCount) return prev;
      return { ...prev, [postId]: normalizedCount };
    });
  }, []);

  const applyPostUpdate = useCallback((updated: any) => {
    setPosts((prev) => {
      const exists = prev.some((item) => item.id === updated.id);
      let next: any[];
      if (exists) {
        next = prev.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                ...updated,
                interactions: updated.interactions
                  ? { ...(item.interactions || {}), ...updated.interactions }
                  : item.interactions,
                userState: updated.userState
                  ? { ...(item.userState || {}), ...updated.userState }
                  : item.userState
              }
            : item
        );
      } else {
        // Realtime insert: prepend without resetting pagination cursors.
        const inserted = prependRealtimeItem(prev, updated);
        next = inserted.inserted ? inserted.next : prev;
      }
      postsRef.current = next;
      return next;
    });
    if (updated.interactions?.comments !== undefined) {
      syncCommentCount(updated.id, updated.interactions?.comments);
    }
  }, [syncCommentCount]);

  const loadMorePosts = useCallback(async () => {
    if (postsLoadingMoreRef.current || postsFeedTerminalRef.current || postsInitialLoadingRef.current) return;
    const cursor = String(postsNextCursorRef.current || '').trim();
    if (
      shouldSkipDuplicateCursorRequest({
        cursor,
        inFlightCursor: postsInFlightCursorRef.current,
        loadMoreInFlight: postsLoadingMoreRef.current,
        lastCompletedCursor: postsLastCompletedCursorRef.current,
        lastCompletedAddedCount: postsLastCompletedAddedRef.current
      })
    ) {
      return;
    }
    const postsLimit = Math.max(6, Math.min(40, Number(profile.feedPageSize || 20)));
    const existingCount = postsRef.current.length;
    const canUseOffsetFallback = !cursor && postsOffsetFallbackRef.current && existingCount > 0;
    const canUseDiscoverySupplement = !cursor && !canUseOffsetFallback && !discoverySupplementUsedRef.current;
    if (!cursor && !canUseOffsetFallback && !canUseDiscoverySupplement) {
      postsFeedTerminalRef.current = true;
      setPostsFeedTerminal(true);
      return;
    }

    postsLoadingMoreRef.current = true;
    postsInFlightCursorRef.current = cursor || null;
    setPostsLoadingMore(true);
    try {
      if (postsTransportRef.current === 'orchestrated' && cursor && !postsOrchestratedFailedRef.current) {
        try {
          const page = await MemberFeedService.tryFetchPage({
            surface: 'community',
            mode: 'for_you',
            limit: postsLimit,
            cursor,
            timeoutMs: 18000
          });
          if (page) {
            const nextPosts = sortPosts(
              (page.posts || [])
                .map((post: any) => {
                  try {
                    return normalizePost(post);
                  } catch {
                    return null;
                  }
                })
                .filter(Boolean)
            );
            const { merged, addedCount } = mergeUniqueFeedItems(postsRef.current, nextPosts);
            if (addedCount > 0) {
              postsEmptyPageStreakRef.current = 0;
              const sorted = sortPosts(merged);
              postsRef.current = sorted;
              setPosts(sorted);
              setCommentCounts((prev) => {
                const next = { ...prev };
                nextPosts.forEach((post: any) => {
                  if (post?.id) next[post.id] = post.interactions?.comments ?? next[post.id] ?? 0;
                });
                return next;
              });
            } else {
              postsEmptyPageStreakRef.current += 1;
            }
            postsLastCompletedCursorRef.current = cursor;
            postsLastCompletedAddedRef.current = addedCount;
            const stopUnchanged = shouldStopUnchangedCursorLoop({
              requestedCursor: cursor,
              returnedCursor: page.nextCursor,
              uniqueAddedCount: addedCount,
              consecutiveEmptyPages: postsEmptyPageStreakRef.current,
              maxEmptyPages: 2
            });
            if (
              !page.hasMore ||
              (!page.nextCursor && addedCount === 0) ||
              stopUnchanged ||
              shouldHaltEmptyPageLoop(postsEmptyPageStreakRef.current, 2)
            ) {
              postsNextCursorRef.current = null;
              setPostsNextCursor(null);
              postsOffsetFallbackRef.current = false;
              setPostsOffsetFallbackEnabled(false);
              postsFeedTerminalRef.current = true;
              setPostsFeedTerminal(true);
            } else {
              postsNextCursorRef.current = page.nextCursor;
              setPostsNextCursor(page.nextCursor);
              postsOffsetFallbackRef.current = false;
              setPostsOffsetFallbackEnabled(false);
              postsFeedTerminalRef.current = false;
              setPostsFeedTerminal(false);
            }
            logFeedLifecycle({
              surface: 'community',
              transport: 'orchestrated',
              kind: 'load_more',
              sequence: 0,
              cursor,
              nextCursor: page.nextCursor,
              itemCount: nextPosts.length,
              hasMore: page.hasMore,
              feedCountAfter: postsRef.current.length
            });
            return;
          }
          postsOrchestratedFailedRef.current = true;
          postsTransportRef.current = resolveTransportAfterFailure(postsTransportRef.current, 'orchestrated');
        } catch (orchestratedError) {
          console.warn('Community orchestrated load-more failed; using Phase 1', orchestratedError);
          postsOrchestratedFailedRef.current = true;
          postsTransportRef.current = resolveTransportAfterFailure(postsTransportRef.current, 'orchestrated');
        }
      }

      let response: any = null;
      let nextPosts: any[] = [];

      if (canUseDiscoverySupplement && !cursor && !canUseOffsetFallback) {
        discoverySupplementUsedRef.current = true;
        try {
          const discovery = await Phase2Service.getDiscoveryFeed({ mode: 'for_you', limit: postsLimit });
          const discoveryPosts = (Array.isArray(discovery?.items) ? discovery.items : [])
            .filter((item: any) => String(item?.type || '').toLowerCase() === 'post' && item?.id)
            .map((item: any) =>
              normalizePost({
                id: item.id,
                title: item.title,
                content: item.description || item.title,
                author: item.author,
                ranking: { score: Number(item.score || 0), primaryReason: Array.isArray(item.why) ? item.why[0] : 'Recommended for you', reasons: item.why || [] },
                createdAt: item.createdAt || item.created_at || new Date().toISOString()
              })
            );
          nextPosts = sortPosts(discoveryPosts);
        } catch (discoveryError) {
          console.warn('Community discovery supplement failed', discoveryError);
          nextPosts = [];
        }
      } else {
        response = canUseOffsetFallback
          ? await CommunityService.getPosts({ limit: postsLimit, offset: existingCount })
          : await CommunityService.getFeed({ limit: postsLimit, scope: 'discover', cursor });
        nextPosts = sortPosts(
          extractCommunityFeedItems(response)
            .map((post: any) => {
              try {
                return normalizePost(post);
              } catch (error) {
                console.warn('Skipping malformed community feed post', error, post);
                return null;
              }
            })
            .filter(Boolean)
        );
      }

      const { merged, addedCount } = mergeUniqueFeedItems(postsRef.current, nextPosts);
      if (addedCount > 0) {
        postsEmptyPageStreakRef.current = 0;
        const sorted = sortPosts(merged);
        postsRef.current = sorted;
        setPosts(sorted);
        setCommentCounts((prev) => {
          const next = { ...prev };
          nextPosts.forEach((post: any) => {
            if (post?.id) next[post.id] = post.interactions?.comments ?? next[post.id] ?? 0;
          });
          return next;
        });
      } else {
        postsEmptyPageStreakRef.current += 1;
      }
      postsLastCompletedCursorRef.current = cursor || null;
      postsLastCompletedAddedRef.current = addedCount;

      const nextCursor = canUseOffsetFallback || canUseDiscoverySupplement ? null : extractCommunityFeedCursor(response);
      const hasMoreFlag = canUseOffsetFallback || canUseDiscoverySupplement ? null : extractHasMore(response);
      const offsetEnabled = shouldContinueOffsetFallback({
        usedOffsetFallback: canUseOffsetFallback,
        nextCursor,
        pageItemCount: nextPosts.length,
        pageSize: postsLimit,
        uniqueAddedCount: addedCount
      });
      const terminal = resolveFeedTerminalState({
        nextCursor,
        hasMoreFlag,
        uniqueAddedCount: addedCount,
        offsetFallbackEnabled: offsetEnabled,
        secondarySourcesRemaining: !discoverySupplementUsedRef.current
      });
      const stopUnchanged = shouldStopUnchangedCursorLoop({
        requestedCursor: cursor,
        returnedCursor: nextCursor,
        uniqueAddedCount: addedCount,
        consecutiveEmptyPages: postsEmptyPageStreakRef.current,
        maxEmptyPages: 2
      });

      if (shouldHaltEmptyPageLoop(postsEmptyPageStreakRef.current, 2) || terminal.isTerminal || stopUnchanged) {
        postsNextCursorRef.current = null;
        setPostsNextCursor(null);
        postsOffsetFallbackRef.current = false;
        setPostsOffsetFallbackEnabled(false);
        postsFeedTerminalRef.current = true;
        setPostsFeedTerminal(true);
      } else {
        postsNextCursorRef.current = nextCursor;
        setPostsNextCursor(nextCursor);
        postsOffsetFallbackRef.current = offsetEnabled;
        setPostsOffsetFallbackEnabled(offsetEnabled);
        postsFeedTerminalRef.current = false;
        setPostsFeedTerminal(false);
      }
      logFeedLifecycle({
        surface: 'community',
        transport: postsTransportRef.current,
        kind: 'load_more',
        sequence: 0,
        cursor: cursor || null,
        nextCursor,
        itemCount: nextPosts.length,
        hasMore: !terminal.isTerminal,
        feedCountAfter: postsRef.current.length
      });
    } catch (error) {
      // Preserve cursor/offset so the sentinel can retry without a full remount.
      console.error('Failed to load more community posts:', error);
    } finally {
      postsLoadingMoreRef.current = false;
      postsInFlightCursorRef.current = null;
      setPostsLoadingMore(false);
    }
  }, [normalizePost, profile.feedPageSize, sortPosts]);

  useEffect(() => {
    let cancelled = false;

    const loadCommunityOverview = async () => {
      const [tagList, eventList, contributorList, threadList, stats] = await Promise.all([
        CommunityService.getTrendingTags(10, 14),
        CommunityService.getEvents(),
        CommunityService.getTopContributors(6),
        CommunityService.getThreads({ limit: 8 }),
        CommunityService.getCommunityStats()
      ]);

      if (cancelled) return;

      const mappedTopics = (Array.isArray(tagList) ? tagList : []).map((topic: any, index: number) => {
        const slug = String(topic?.slug || topic?.tag || topic?.name || '').trim();
        const titleSeed = String(topic?.label || topic?.name || slug || '').trim();
        return {
          id: String(topic?.id || slug || `topic-${index + 1}`),
          slug,
          title: titleSeed
            ? titleSeed
                .split('-')
                .filter(Boolean)
                .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
                .join(' ')
            : `Topic ${index + 1}`,
          count: Number(topic?.posts ?? topic?.postCount ?? topic?.postsCount ?? topic?.count ?? 0)
        };
      });

      const mappedEvents = (Array.isArray(eventList) ? eventList : []).map((event: any, index: number) => {
        const startTime = event?.startTime || event?.start_time || null;
        const date = startTime ? new Date(startTime) : null;
        return {
          id: String(event?.id || `event-${index + 1}`),
          title: String(event?.title || 'Community event'),
          date:
            date && Number.isFinite(date.getTime())
              ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              : 'Upcoming',
          startTime: startTime || '',
          attendees: Number(event?.attendees ?? event?.attendeeCount ?? event?.attendee_count ?? 0),
          location: String(event?.location || ''),
          type: String(event?.type || '')
        };
      });

      const mappedContributors = (Array.isArray(contributorList) ? contributorList : []).map((contributor: any, index: number) => {
        const followers = Number(contributor?.followersCount ?? contributor?.followers_count ?? 0);
        const postsCount = Number(contributor?.postsCount ?? contributor?.posts_count ?? 0);
        const reputation = Math.max(0, followers * 2 + postsCount * 5);
        const name =
          contributor?.name ||
          contributor?.userName ||
          contributor?.user_name ||
          contributor?.username ||
          `Contributor ${index + 1}`;
        return {
          id: String(contributor?.id || contributor?.userId || contributor?.user_id || `contributor-${index + 1}`),
          name: String(name),
          reputation,
          followers,
          postsCount,
          avatar: String(contributor?.avatar || contributor?.userAvatar || contributor?.user_avatar || '')
        };
      });

      const mappedDiscussions = (Array.isArray(threadList) ? threadList : []).map((thread: any, index: number) => ({
        id: String(thread?.id || `thread-${index + 1}`),
        title: String(thread?.title || 'Discussion'),
        author: String(thread?.userName || thread?.user_name || 'Community member'),
        lastReply: formatRelativeTime(thread?.createdAt || thread?.created_at),
        replies: Number(thread?.repliesCount ?? thread?.replies_count ?? thread?.interactions?.comments ?? 0)
      }));

      setTrendingTopics(mappedTopics);
      setUpcomingEvents(mappedEvents);
      setTopContributors(mappedContributors);
      setDiscussions(mappedDiscussions);
      setCommunityStats({
        members: Number(stats?.members || 0),
        discussions: Number(stats?.discussions || 0),
        topics: Number(stats?.topics || 0),
        events: Number(stats?.events || 0)
      });
    };

    const fetchData = async () => {
      postsInitialLoadingRef.current = true;
      // Only full-page gate when there is no existing content (soft reloads keep feed mounted).
      if (postsRef.current.length === 0) {
        setLoading(true);
      }
      setStoriesLoading(true);
      setReelsLoading(true);
      const postsLimit = Math.max(6, Math.min(40, Number(profile.feedPageSize || 20)));
      const reelsLimit = Math.max(6, Math.min(24, Number(profile.feedPageSize || 18)));
      try {
        const [
          feedPostsResult,
          adsResult,
          homepageConfigResult,
          storiesFeedResult,
          scrollFeedResult,
          overviewResult,
          pagesResult,
          peopleResult
        ] = await Promise.allSettled([
          CommunityService.getFeed({ limit: postsLimit, scope: 'discover' }),
          Promise.allSettled([
            CommunityService.getPublicAds({ placement: 'community_feed', limit: 8 }),
            CommunityService.getPublicAds({ placement: 'homepage_feed', limit: 6 })
          ]).then((results) => {
            const merged: any[] = [];
            results.forEach((result) => {
              if (result.status === 'fulfilled' && Array.isArray(result.value)) merged.push(...result.value);
            });
            const seen = new Set<string>();
            return merged.filter((ad) => {
              const id = String(ad?.id || '').trim();
              if (!id || seen.has(id)) return false;
              seen.add(id);
              return true;
            });
          }),
          CommunityService.getCommunityHomepage(),
          CommunityService.getStoriesFeed(),
          ScrollService.getFeed({ limit: reelsLimit }),
          loadCommunityOverview(),
          CommunityService.getRecommendedBusinessPages(4),
          user?.id
            ? Promise.allSettled([
                RecoService.getAccounts({ surface: 'who_to_follow', type: 'freelancer', limit: 4 }),
                RecoService.getAccounts({ surface: 'who_to_follow', type: 'client', limit: 4 })
              ]).then((results) => {
                const merged: any[] = [];
                results.forEach((result) => {
                  if (result.status === 'fulfilled' && Array.isArray(result.value)) merged.push(...result.value);
                });
                const seen = new Set<string>();
                return merged.filter((account) => {
                  const id = String(account?.id || account?.entityId || account?.user?.id || '').trim();
                  if (!id || seen.has(id)) return false;
                  seen.add(id);
                  return true;
                });
              })
            : Promise.resolve([])
        ]);
        if (cancelled) return;

        // Phase 3: prefer orchestrated member-feed for initial community posts stream.
        // Stay on legacy after a session failure (no orchestrated/legacy flapping).
        let usedOrchestrated = false;
        const mayTryOrchestrated = !postsOrchestratedFailedRef.current || postsTransportRef.current === 'orchestrated';
        try {
          if (mayTryOrchestrated) {
          const orchestrated = await MemberFeedService.tryFetchPage({
            surface: 'community',
            mode: 'for_you',
            limit: postsLimit,
            timeoutMs: 15000
          });
          if (orchestrated && (orchestrated.posts.length > 0 || orchestrated.hasMore)) {
            usedOrchestrated = true;
            postsTransportRef.current = 'orchestrated';
            postsOrchestratedFailedRef.current = false;
            const normalizedPosts = sortPosts(
              orchestrated.posts.map((post: any) => {
                try {
                  return normalizePost(post);
                } catch {
                  return null;
                }
              }).filter(Boolean)
            );
            postsEmptyPageStreakRef.current = 0;
            discoverySupplementUsedRef.current = true;
            postsFeedTerminalRef.current = !orchestrated.hasMore && normalizedPosts.length === 0;
            setPostsFeedTerminal(postsFeedTerminalRef.current);
            setPosts((prev) => (normalizedPosts.length === 0 && prev.length ? prev : normalizedPosts));
            postsRef.current = normalizedPosts.length ? normalizedPosts : postsRef.current;
            postsNextCursorRef.current = orchestrated.nextCursor;
            setPostsNextCursor(orchestrated.nextCursor);
            postsOffsetFallbackRef.current = false;
            setPostsOffsetFallbackEnabled(false);
            setCommentCounts((prev) => {
              if (normalizedPosts.length === 0 && Object.keys(prev).length) return prev;
              return normalizedPosts.reduce((acc: Record<string, number>, post: any) => {
                acc[post.id] = post.interactions?.comments ?? 0;
                return acc;
              }, {});
            });
            if (orchestrated.people.length) {
              setRecommendedCommunityPeople((prev) => (prev.length ? prev : orchestrated.people.slice(0, 6)));
            }
            if (orchestrated.pages.length) {
              setRecommendedCommunityPages((prev) => (prev.length ? prev : orchestrated.pages.slice(0, 4)));
            }
            const followSeed: Record<string, boolean> = {};
            const authorIds = new Set<string>();
            normalizedPosts.forEach((post: any) => {
              const authorType = String(post.author?.type || 'user').toLowerCase();
              const authorId = String(post.author?.id || post.authorId || '').trim();
              if (authorType !== 'user' || !authorId || String(user?.id || '') === authorId) return;
              authorIds.add(authorId);
              if (post.viewer?.isFollowingAuthor !== undefined) {
                followSeed[authorId] = Boolean(post.viewer.isFollowingAuthor);
              }
            });
            if (Object.keys(followSeed).length) {
              setFollowStatuses((prev) => ({ ...prev, ...followSeed }));
            }
          }
          }
        } catch (orchestratedInitError) {
          console.warn('Community orchestrated feed unavailable; using Phase 1', orchestratedInitError);
          postsOrchestratedFailedRef.current = true;
          postsTransportRef.current = resolveTransportAfterFailure(postsTransportRef.current, 'orchestrated');
        }

        if (!usedOrchestrated && feedPostsResult.status === 'fulfilled') {
          postsTransportRef.current = 'legacy';
          let rawPosts = extractCommunityFeedItems(feedPostsResult.value);
          let nextCursor = extractCommunityFeedCursor(feedPostsResult.value);
          if (rawPosts.length === 0) {
            try {
              const fallbackResponse = await CommunityService.getPosts({ limit: postsLimit });
              rawPosts = extractCommunityFeedItems(fallbackResponse);
            } catch (feedFallbackError) {
              console.warn('Failed to load community feed fallback:', feedFallbackError);
            }
          }
          const normalizedPosts = sortPosts(rawPosts.map(normalizePost));
          postsEmptyPageStreakRef.current = 0;
          discoverySupplementUsedRef.current = false;
          postsFeedTerminalRef.current = false;
          setPostsFeedTerminal(false);
          setPosts((prev) => (normalizedPosts.length === 0 && prev.length ? prev : normalizedPosts));
          postsRef.current = normalizedPosts.length ? normalizedPosts : postsRef.current;
          postsNextCursorRef.current = nextCursor;
          setPostsNextCursor(nextCursor);
          const offsetOn = Boolean(normalizedPosts.length) && !nextCursor;
          postsOffsetFallbackRef.current = offsetOn;
          setPostsOffsetFallbackEnabled(offsetOn);
          setCommentCounts((prev) => {
            if (normalizedPosts.length === 0 && Object.keys(prev).length) return prev;
            return normalizedPosts.reduce((acc: Record<string, number>, post: any) => {
              acc[post.id] = post.interactions?.comments ?? 0;
              return acc;
            }, {});
          });

          const followSeed: Record<string, boolean> = {};
          const authorIds = new Set<string>();
          normalizedPosts.forEach((post: any) => {
            const authorType = String(post.author?.type || 'user').toLowerCase();
            const authorId = String(post.author?.id || post.authorId || '').trim();
            if (authorType !== 'user' || !authorId || String(user?.id || '') === authorId) return;
            authorIds.add(authorId);
            if (post.viewer?.isFollowingAuthor !== undefined) {
              followSeed[authorId] = Boolean(post.viewer.isFollowingAuthor);
            }
          });
          if (Object.keys(followSeed).length) {
            setFollowStatuses((prev) => ({ ...prev, ...followSeed }));
          }
          if (authorIds.size && user?.id) {
            try {
              const statusMap = await CommunityService.getFollowStatus(Array.from(authorIds));
              if (cancelled) return;
              setFollowStatuses(statusMap);
            } catch (error) {
              console.warn('Failed to hydrate follow status map for community posts:', error);
            }
          }
        } else {
          console.error('Failed to load community posts:', feedPostsResult.reason);
          setPostsNextCursor(null);
        }

        if (adsResult.status === 'fulfilled') {
          setAds(Array.isArray(adsResult.value) ? adsResult.value : []);
        } else {
          console.error('Failed to load community ads:', adsResult.reason);
        }

        if (homepageConfigResult.status === 'fulfilled') {
          setHomepage(homepageConfigResult.value || null);
        } else {
          console.error('Failed to load community homepage config:', homepageConfigResult.reason);
        }

        if (storiesFeedResult.status === 'fulfilled') {
          const filteredStories = filterActiveStories(Array.isArray(storiesFeedResult.value) ? storiesFeedResult.value : []);
          const nextStories = await hydrateStoryAuthorAvatars(filteredStories, user);
          if (cancelled) return;
          setStories((prev) => (nextStories.length === 0 && prev.length ? prev : nextStories));
        } else {
          console.error('Failed to load community stories:', storiesFeedResult.reason);
        }

        if (scrollFeedResult.status === 'fulfilled') {
          const nextReels = Array.isArray(scrollFeedResult.value?.items)
            ? scrollFeedResult.value.items
                .filter((item: ScrollVideo) => String(item?.status || '').toUpperCase() !== 'REMOVED')
                .slice(0, reelsLimit)
            : [];
          setScrollConfig(scrollFeedResult.value?.config || null);
          setReels((prev) => (nextReels.length === 0 && prev.length ? prev : nextReels));
        } else {
          console.error('Failed to load community reels:', scrollFeedResult.reason);
        }

        if (overviewResult.status === 'rejected') {
          console.error('Failed to load community overview:', overviewResult.reason);
        }

        if (pagesResult.status === 'fulfilled') {
          const pages = Array.isArray(pagesResult.value) ? pagesResult.value : [];
          setRecommendedCommunityPages(
            pages
              .map((page: any) => {
                const source = page?.account || page || {};
                const id = String(source?.id || page?.entityId || page?.pageId || '').trim();
                if (!id) return null;
                return {
                  id,
                  name: String(source?.name || page?.name || 'Business page').trim() || 'Business page',
                  slug: source?.slug || source?.pageSlug || page?.slug || page?.handle || '',
                  handle: source?.handle || source?.pageHandle || page?.handle || '',
                  avatar: resolveUserAvatarUrl(source || page) || null,
                  tagline: source?.tagline || source?.headline || page?.tagline || page?.description || '',
                  followersCount: Number(source?.followersCount || page?.followersCount || 0),
                  isFollowing: Boolean(source?.isFollowing ?? page?.isFollowing),
                  followId: source?.followId || page?.followId || null
                };
              })
              .filter(Boolean)
          );
        } else {
          console.error('Failed to load community page recommendations:', pagesResult.reason);
        }

        if (peopleResult.status === 'fulfilled') {
          const people = Array.isArray(peopleResult.value) ? peopleResult.value : [];
          setRecommendedCommunityPeople(
            people
              .map((account: any) => {
                const source = account?.user || account?.account || account || {};
                const id = String(source?.id || account?.entityId || account?.userId || '').trim();
                if (!id) return null;
                return {
                  id,
                  name: String(source?.name || account?.name || 'Community member').trim() || 'Community member',
                  username: source?.username || source?.handle || account?.username || account?.handle || '',
                  avatar:
                    resolveUserAvatarUrl(source || account) ||
                    resolveAssetUrl(source?.avatarUrl || source?.avatar || source?.profilePhotoUrl || account?.avatarUrl || account?.avatar) ||
                    null,
                  headline: source?.headline || source?.bio || account?.headline || account?.reason || 'Recommended for your network',
                  isFollowing: Boolean(source?.isFollowing ?? account?.isFollowing)
                };
              })
              .filter(Boolean)
              .slice(0, 6)
          );
        } else {
          console.error('Failed to load community people recommendations:', peopleResult.reason);
        }
      } catch (error) {
        console.error('Error loading community data:', error);
      } finally {
        postsInitialLoadingRef.current = false;
        if (!cancelled) {
          setStoriesLoading(false);
          setReelsLoading(false);
          setLoading(false);
        }
      }
    };

    fetchData();

    const refreshCommunityOverview = () => {
      loadCommunityOverview().catch((error) => {
        console.error('Failed to refresh community overview:', error);
      });
    };

    const onAdEvent = async () => {
      try {
        const adResults = await Promise.allSettled([
          CommunityService.getPublicAds({ placement: 'community_feed', limit: 8 }),
          CommunityService.getPublicAds({ placement: 'homepage_feed', limit: 6 })
        ]);
        const merged: any[] = [];
        adResults.forEach((result) => {
          if (result.status === 'fulfilled' && Array.isArray(result.value)) merged.push(...result.value);
        });
        const seen = new Set<string>();
        const newAds = merged.filter((ad) => {
          const id = String(ad?.id || '').trim();
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        if (cancelled) return;
        setAds(newAds);
      } catch (e) { console.error('Failed to refresh ads on event', e); }
    };
    const onHomepageUpdate = async () => {
      try {
        const updated = await CommunityService.getCommunityHomepage();
        if (cancelled) return;
        setHomepage(updated);
      } catch (e) { console.error('Failed to refresh homepage config', e); }
    };
    const onStoryUpdate = async () => {
      try {
        const updated = await CommunityService.getStoriesFeed();
        if (cancelled) return;
        const nextStories = filterActiveStories(Array.isArray(updated) ? updated : []);
        setStories((prev) => (nextStories.length === 0 && prev.length ? prev : nextStories));
      } catch (e) { console.error('Failed to refresh stories', e); }
    };
    const onStoryUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const payload = detail?.story || detail;
      if (payload?.id) {
        applyStoryUpdate(payload);
      } else {
        onStoryUpdate();
      }
    };
    const onStoryLiked = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const storyId = detail?.storyId;
      if (!storyId) return;
      const likesCount = detail?.likesCount;
      const likedByViewer = user?.id ? String(detail?.userId) === String(user.id) && detail?.liked : undefined;
      setStories((prev) =>
        prev.map((story) =>
          story.id === storyId
            ? {
                ...story,
                likesCount: likesCount ?? story.likesCount ?? story.likes_count,
                viewerLiked: likedByViewer ?? story.viewerLiked,
                _count: { ...(story._count || {}), likes: likesCount ?? story._count?.likes }
              }
            : story
        )
      );
      setActiveStory((current) =>
        current?.id === storyId
          ? {
              ...current,
              likesCount: likesCount ?? current.likesCount ?? current.likes_count,
              viewerLiked: likedByViewer ?? current.viewerLiked,
              _count: { ...(current._count || {}), likes: likesCount ?? current._count?.likes }
            }
          : current
      );
    };
    const onStoryEngaged = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const payload = detail?.story || detail;
      if (payload?.id) {
        applyStoryUpdate(payload);
        return;
      }
      const storyId = String(detail?.storyId || '').trim();
      if (!storyId) return;
      const interactions = detail?.interactions || {};
      setStories((prev) =>
        prev.map((story) =>
          story.id === storyId
            ? {
                ...story,
                commentsCount: interactions.comments ?? story.commentsCount ?? 0,
                repostsCount: interactions.reposts ?? story.repostsCount ?? 0,
                dashesCount: interactions.dashes ?? story.dashesCount ?? 0,
                sendsCount: interactions.sends ?? story.sendsCount ?? 0,
                interactions: {
                  ...(story.interactions || {}),
                  comments: interactions.comments ?? story.interactions?.comments ?? story.commentsCount ?? 0,
                  reposts: interactions.reposts ?? story.interactions?.reposts ?? story.repostsCount ?? 0,
                  dashes: interactions.dashes ?? story.interactions?.dashes ?? story.dashesCount ?? 0,
                  sends: interactions.sends ?? story.interactions?.sends ?? story.sendsCount ?? 0
                }
              }
            : story
        )
      );
      setActiveStory((current) =>
        current?.id === storyId
          ? {
              ...current,
              commentsCount: interactions.comments ?? current.commentsCount ?? 0,
              repostsCount: interactions.reposts ?? current.repostsCount ?? 0,
              dashesCount: interactions.dashes ?? current.dashesCount ?? 0,
              sendsCount: interactions.sends ?? current.sendsCount ?? 0,
              interactions: {
                ...(current.interactions || {}),
                comments: interactions.comments ?? current.interactions?.comments ?? current.commentsCount ?? 0,
                reposts: interactions.reposts ?? current.interactions?.reposts ?? current.repostsCount ?? 0,
                dashes: interactions.dashes ?? current.interactions?.dashes ?? current.dashesCount ?? 0,
                sends: interactions.sends ?? current.interactions?.sends ?? current.sendsCount ?? 0
              }
            }
          : current
      );
    };
    const adEvents = ['community:ad_status_updated', 'community:ad_created', 'community:ad_deleted', 'community:ads_config_updated'];
    adEvents.forEach((eventName) => window.addEventListener(eventName, onAdEvent as EventListener));
    window.addEventListener('community:homepage_updated', onHomepageUpdate as EventListener);
    window.addEventListener('community:story_created', onStoryUpdate as EventListener);
    window.addEventListener('community:story_deleted', onStoryUpdate as EventListener);
    window.addEventListener('community:story_updated', onStoryUpdated as EventListener);
    window.addEventListener('community:story_liked', onStoryLiked as EventListener);
    window.addEventListener('community:story_engaged', onStoryEngaged as EventListener);
    window.addEventListener('community:event_registered', refreshCommunityOverview as EventListener);
    window.addEventListener('community:event_unregistered', refreshCommunityOverview as EventListener);
    window.addEventListener('community:event_created', refreshCommunityOverview as EventListener);
    window.addEventListener('community:event_updated', refreshCommunityOverview as EventListener);
    window.addEventListener('community:event_deleted', refreshCommunityOverview as EventListener);
    window.addEventListener('community:stats_updated', refreshCommunityOverview as EventListener);
    window.addEventListener('community:thread_created', refreshCommunityOverview as EventListener);
    window.addEventListener('community:thread_deleted', refreshCommunityOverview as EventListener);
    window.addEventListener('community:comment_created', refreshCommunityOverview as EventListener);

    return () => {
      cancelled = true;
      adEvents.forEach((eventName) => window.removeEventListener(eventName, onAdEvent as EventListener));
      window.removeEventListener('community:homepage_updated', onHomepageUpdate as EventListener);
      window.removeEventListener('community:story_created', onStoryUpdate as EventListener);
      window.removeEventListener('community:story_deleted', onStoryUpdate as EventListener);
      window.removeEventListener('community:story_updated', onStoryUpdated as EventListener);
      window.removeEventListener('community:story_liked', onStoryLiked as EventListener);
      window.removeEventListener('community:story_engaged', onStoryEngaged as EventListener);
      window.removeEventListener('community:event_registered', refreshCommunityOverview as EventListener);
      window.removeEventListener('community:event_unregistered', refreshCommunityOverview as EventListener);
      window.removeEventListener('community:event_created', refreshCommunityOverview as EventListener);
      window.removeEventListener('community:event_updated', refreshCommunityOverview as EventListener);
      window.removeEventListener('community:event_deleted', refreshCommunityOverview as EventListener);
      window.removeEventListener('community:stats_updated', refreshCommunityOverview as EventListener);
      window.removeEventListener('community:thread_created', refreshCommunityOverview as EventListener);
      window.removeEventListener('community:thread_deleted', refreshCommunityOverview as EventListener);
      window.removeEventListener('community:comment_created', refreshCommunityOverview as EventListener);
    };
    // Intentionally omit normalizePost/sortPosts identities — unstable callbacks must not
    // re-trigger full community bootstrap (that unmounted/remounted the feed and caused shake).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.feedPageSize, user?.id, user?.role]);

  useEffect(() => {
    const onPostCreated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;
      const payload = detail.post || detail;
      applyPostUpdate(normalizePost(payload));
    };
    const onPostUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;
      const payload = detail.post || detail;
      applyPostUpdate(normalizePost(payload));
    };
    const onPostDeleted = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const postId = detail?.postId || detail?.id;
      if (!postId) return;
      setPosts((prev) => prev.filter((item) => item.id !== postId));
      setCommentCounts((prev) => {
        const next = { ...prev };
        delete next[postId];
        return next;
      });
      if (editingPostId === postId) {
        setEditingPostId(null);
        setEditingDraft(null);
      }
    };
    const onPostMetricsUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;
      const postId = detail?.postId || detail?.id;
      if (!postId) return;
      const interactions = detail.interactions || detail.counts || {
        likes: detail.likesCount ?? detail.likes,
        comments: detail.commentsCount ?? detail.comments,
        shares: detail.sharesCount ?? detail.shares,
        reposts: detail.repostsCount ?? detail.reposts
      };
      applyPostUpdate({
        id: postId,
        interactions,
        likesCount: interactions.likes,
        sharesCount: interactions.shares,
        repostsCount: interactions.reposts
      });
    };
    const onPostReactionUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const postId = String(detail?.postId || detail?.id || '').trim();
      const reactions = detail?.reactions;
      if (!postId || !reactions || typeof reactions !== 'object') return;
      setPosts((prev) =>
        prev.map((item) =>
          item.id === postId
            ? {
                ...item,
                interactions: {
                  ...(item.interactions || {}),
                  reactions
                }
              }
            : item
        )
      );
    };
    const onPostAiInsightReady = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const postId = String(detail?.postId || detail?.id || '').trim();
      if (!postId) return;
      const insightTextRaw = detail?.aiInsightText ?? detail?.ai_insight_text ?? null;
      const insightText =
        insightTextRaw === null || insightTextRaw === undefined
          ? null
          : String(insightTextRaw).trim() || null;
      applyPostUpdate({
        id: postId,
        aiInsightEnabled: Boolean(detail?.aiInsightEnabled ?? detail?.ai_insight_enabled ?? true),
        aiInsightGenerated: Boolean(
          detail?.aiInsightGenerated ?? detail?.ai_insight_generated ?? (insightText ? true : false)
        ),
        aiInsightText: insightText
      });
    };

    window.addEventListener('community:post_created', onPostCreated as EventListener);
    window.addEventListener('community:post_updated', onPostUpdated as EventListener);
    window.addEventListener('community:post_deleted', onPostDeleted as EventListener);
    window.addEventListener('community:post_metrics_updated', onPostMetricsUpdated as EventListener);
    window.addEventListener('community:post_reaction_updated', onPostReactionUpdated as EventListener);
    window.addEventListener('community:post_ai_insight_ready', onPostAiInsightReady as EventListener);
    window.addEventListener('post:aiInsightReady', onPostAiInsightReady as EventListener);
    return () => {
      window.removeEventListener('community:post_created', onPostCreated as EventListener);
      window.removeEventListener('community:post_updated', onPostUpdated as EventListener);
      window.removeEventListener('community:post_deleted', onPostDeleted as EventListener);
      window.removeEventListener('community:post_metrics_updated', onPostMetricsUpdated as EventListener);
      window.removeEventListener('community:post_reaction_updated', onPostReactionUpdated as EventListener);
      window.removeEventListener('community:post_ai_insight_ready', onPostAiInsightReady as EventListener);
      window.removeEventListener('post:aiInsightReady', onPostAiInsightReady as EventListener);
    };
  }, [applyPostUpdate, editingPostId, normalizePost]);

  useEffect(() => {
    if (!user?.id) return;
    const onFollowUpdated = (event: Event) => {
      const payload = (event as CustomEvent).detail;
      applyFollowUpdatePayload(payload, user.id);
    };
    window.addEventListener('community:follow_updated', onFollowUpdated as EventListener);
    return () => window.removeEventListener('community:follow_updated', onFollowUpdated as EventListener);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      resetFollowState();
    }
  }, [user?.id]);

  useEffect(() => {
    if (!ads || ads.length === 0) return;
    ads.forEach((ad: any) => {
      if (!ad?.id || impressionTracked.current.has(ad.id)) return;
      impressionTracked.current.add(ad.id);
      AdService.recordImpression(ad.id).catch(() => {});
    });
  }, [ads]);

  useEffect(() => {
    viewTracked.current.clear();
  }, [user?.id]);

  useEffect(() => {
    if (!user || !posts || posts.length === 0) return;
    posts.forEach((post: any) => {
      if (!post?.id || viewTracked.current.has(post.id)) return;
      viewTracked.current.add(post.id);
      CommunityService.postView(post.id).catch(() => {});
    });
  }, [posts, user]);

  useEffect(() => {
    if (storyCameraOpen && storyVideoRef.current && storyCameraStream) {
      storyVideoRef.current.srcObject = storyCameraStream;
    }
  }, [storyCameraOpen, storyCameraStream]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStories((prev) => filterActiveStories(prev));
    }, 60000);
    return () => window.clearInterval(id);
  }, [filterActiveStories]);

  useEffect(() => {
    const onScrollNew = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      const created = detail?.scroll || detail;
      if (!created?.id) return;
      setReels((prev) => [created, ...prev.filter((item) => item.id !== created.id)].slice(0, 18));
    };
    const onScrollRemoved = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      const removedId = String(detail?.scrollId || detail?.id || '').trim();
      if (!removedId) return;
      setReels((prev) => prev.filter((item) => item.id !== removedId));
    };

    window.addEventListener('scroll:new', onScrollNew as EventListener);
    window.addEventListener('scroll:removed', onScrollRemoved as EventListener);
    return () => {
      window.removeEventListener('scroll:new', onScrollNew as EventListener);
      window.removeEventListener('scroll:removed', onScrollRemoved as EventListener);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (storyRecorderRef.current && storyRecording) {
        try {
          storyRecorderRef.current.stop();
        } catch (e) {
          console.error(e);
        }
      }
      if (storyCameraStream) {
        storyCameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [storyCameraStream, storyRecording]);

  const stopStoryCamera = () => {
    if (storyRecorderRef.current && storyRecording) {
      try {
        storyRecorderRef.current.stop();
      } catch (e) {
        console.error(e);
      }
      return;
    }
    if (storyCameraStream) {
      storyCameraStream.getTracks().forEach(track => track.stop());
    }
    setStoryCameraStream(null);
    setStoryCameraOpen(false);
    setStoryRecording(false);
  };

  const publishStoryText = async () => {
    if (!user || !storyDraft.content.trim()) return;
    setStoryPosting(true);
    try {
      const created = await CommunityService.createStory({
        type: 'text',
        content: storyDraft.content.trim(),
        visibility: storyDraft.visibility,
        textBackground: storyDraft.textBackground,
        textColor: storyDraft.textColor,
        textFont: storyDraft.textFont,
        textAlign: storyDraft.textAlign
      });
      setStories((prev) => filterActiveStories([created, ...prev.filter((item) => String(item?.id) !== String(created?.id))]));
      setStoryDraft({
        content: '',
        visibility: 'public',
        ...getDefaultStoryTextDraft()
      });
      setStoryTextOpen(false);
      showNotification('success', 'Stories', 'Your story is live.');
    } catch (error: any) {
      console.error(error);
      showNotification('error', 'Stories', error?.message || 'Unable to post story.');
    } finally {
      setStoryPosting(false);
    }
  };

  const clearStoryMediaUploadState = () => {
    setStoryMediaUploadBusy(false);
    setStoryMediaUploadLabel('');
    setStoryMediaUploadProgress(0);
  };

  const publishStoryFile = async (file: File, type: 'image' | 'video') => {
    if (!user) return;
    setStoryPosting(true);
    setStoryMediaUploadBusy(true);
    setStoryMediaUploadProgress(0);
    setStoryMediaUploadLabel(`Uploading ${file.name}`);
    try {
      const uploaded = await FileService.uploadFile(file, 'community', {
        role: user.role,
        visibility: isPrivateStoryVisibility(storyDraft.visibility) ? 'private' : 'public',
        userId: user.id,
        onProgress: (percent) => {
          setStoryMediaUploadProgress(percent || 0);
          setStoryMediaUploadLabel(percent >= 100 ? `Preparing ${file.name}` : `Uploading ${file.name}`);
        }
      });
      setStoryMediaUploadProgress(100);
      setStoryMediaUploadLabel('Preparing your story for publish...');
      const created = await CommunityService.createStory({
        type,
        mediaFileId: uploaded.id,
        visibility: storyDraft.visibility
      });
      setStories((prev) => filterActiveStories([created, ...prev.filter((item) => String(item?.id) !== String(created?.id))]));
      showNotification('success', 'Stories', 'Your story is live.');
    } catch (error: any) {
      console.error(error);
      showNotification('error', 'Stories', error?.message || 'Unable to post story.');
    } finally {
      setStoryPosting(false);
      clearStoryMediaUploadState();
    }
  };

  const handleStoryDeviceSelection = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] || null;
      event.currentTarget.value = '';
      if (!file) return;
      const mime = String(file.type || '').toLowerCase();
      const type = mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : null;
      if (!type) {
        showNotification('warning', 'Stories', 'Please choose an image or video file.');
        return;
      }
      void publishStoryFile(file, type);
    },
    [publishStoryFile, showNotification]
  );

  const startStoryCamera = async () => {
    if (!user) return;
    if (Capacitor.isNativePlatform()) {
      storyCameraInputRef.current?.click();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showNotification('warning', 'Camera', 'Camera access is not available in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStoryCameraStream(stream);
      setStoryCameraOpen(true);
    } catch (error) {
      console.error(error);
      showNotification('error', 'Camera', 'Unable to access camera.');
    }
  };

  const captureStoryPhoto = async () => {
    const video = storyVideoRef.current;
    const canvas = storyCanvasRef.current;
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
        const file = new File([blob], `story-${Date.now()}.png`, { type: blob.type || 'image/png' });
        await publishStoryFile(file, 'image');
      } catch (error) {
        console.error(error);
      } finally {
        stopStoryCamera();
      }
    }, 'image/png');
  };

  const startStoryRecording = () => {
    if (!storyCameraStream || storyRecording) return;
    if (typeof MediaRecorder === 'undefined') {
      showNotification('warning', 'Camera', 'Video recording is not supported in this browser.');
      return;
    }
    storyChunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(storyCameraStream, { mimeType: 'video/webm' });
    } catch (e) {
      recorder = new MediaRecorder(storyCameraStream);
    }
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        storyChunksRef.current.push(event.data);
      }
    };
    recorder.onstop = async () => {
      const blob = new Blob(storyChunksRef.current, { type: recorder.mimeType || 'video/webm' });
      if (!blob.size) return;
      try {
        const file = new File([blob], `story-${Date.now()}.webm`, { type: blob.type });
        await publishStoryFile(file, 'video');
      } catch (error) {
        console.error(error);
        showNotification('error', 'Stories', 'Video upload failed.');
      } finally {
        setStoryRecording(false);
        stopStoryCamera();
      }
    };
    storyRecorderRef.current = recorder;
    recorder.start();
    setStoryRecording(true);
  };

  const stopStoryRecording = () => {
    if (!storyRecorderRef.current) return;
    try {
      storyRecorderRef.current.stop();
    } catch (e) {
      console.error(e);
    }
  };

  const openStoryEditor = (story: any) => {
    if (!story) return;
    const style = getStoryTextStyle(story);
    setEditingStory(story);
    setStoryEditDraft({
      content: resolveStoryContent(story) || '',
      visibility: normalizeStoryVisibility(story.visibility),
      textBackground: style.background,
      textColor: style.color,
      textFont: style.fontFamily,
      textAlign: (style.textAlign as any) || 'center'
    });
    setStoryEditOpen(true);
  };

  const saveStoryEdit = async () => {
    if (!editingStory?.id) return;
    if (!canManageStory(editingStory)) return;
    setStoryEditSaving(true);
    try {
      const payload: any = {
        content: storyEditDraft.content?.trim() || undefined,
        visibility: storyEditDraft.visibility
      };
      if (editingStory.type === 'text') {
        payload.textBackground = storyEditDraft.textBackground;
        payload.textColor = storyEditDraft.textColor;
        payload.textFont = storyEditDraft.textFont;
        payload.textAlign = storyEditDraft.textAlign;
      }
      const updated = await CommunityService.updateStory(editingStory.id, payload);
      applyStoryUpdate(updated);
      setStoryEditOpen(false);
      setEditingStory(null);
      showNotification('success', 'Stories', 'Story updated.');
    } catch (error: any) {
      console.error('Failed to update story', error);
      showNotification('error', 'Stories', error?.message || 'Unable to update story.');
    } finally {
      setStoryEditSaving(false);
    }
  };

  const handleStoryDelete = async (story: any) => {
    if (!story?.id) return;
    if (!canManageStory(story)) return;
    if (!confirm('Delete this story?')) return;
    setStoryActionBusy((prev) => ({ ...prev, [story.id]: true }));
    try {
      await CommunityService.deleteStory(story.id);
      setStories((prev) => prev.filter((item) => item.id !== story.id));
      setActiveStory((current) => (current?.id === story.id ? null : current));
      showNotification('success', 'Stories', 'Story deleted.');
    } catch (error: any) {
      console.error('Failed to delete story', error);
      showNotification('error', 'Stories', error?.message || 'Unable to delete story.');
    } finally {
      setStoryActionBusy((prev) => ({ ...prev, [story.id]: false }));
    }
  };

  const handleStoryLike = async (story: any) => {
    if (!story?.id) return;
    if (!user) {
      if (confirm('Log in to like stories?')) window.location.href = '/auth/login';
      return;
    }
    if (storyActionBusy[story.id]) return;
    setStoryActionBusy((prev) => ({ ...prev, [story.id]: true }));
    try {
      const response = await CommunityService.toggleStoryLike(story.id);
      const payload = response?.data ?? response ?? {};
      const liked = payload?.liked ?? payload?.viewerLiked ?? !Boolean(story.viewerLiked);
      const likesCount =
        payload?.likesCount ??
        payload?.likes ??
        Math.max(0, (story.likesCount ?? story.likes_count ?? story._count?.likes ?? 0) + (liked ? 1 : -1));
      applyStoryUpdate({
        ...story,
        likesCount,
        viewerLiked: liked,
        _count: { ...(story._count || {}), likes: likesCount }
      });
      window.dispatchEvent(
        new CustomEvent('community:story_liked', {
          detail: {
            storyId: story.id,
            userId: user.id,
            liked,
            likesCount,
            story: {
              id: story.id,
              likesCount,
              viewerLiked: liked,
              _count: { ...(story._count || {}), likes: likesCount }
            }
          }
        })
      );
    } catch (error: any) {
      console.error('Failed to like story', error);
      showNotification('error', 'Stories', error?.message || 'Unable to like story.');
    } finally {
      setStoryActionBusy((prev) => ({ ...prev, [story.id]: false }));
    }
  };

  const openStory = async (story: any) => {
    setActiveStory(story);
    if (story?.id) {
      try {
        await CommunityService.viewStory(story.id);
      } catch (e) {
        console.error('Failed to record story view', e);
      }
    }
  };

  const promotePost = (post: any) => {
    if (!user) {
      if (confirm('Log in to promote this post?')) window.location.href = '/auth/login';
      return;
    }
    const postId = String(post?.id || '').trim();
    if (!postId) {
      showNotification('error', 'Promote this post', 'Post details are not available.');
      return;
    }
    const boostMedia = Array.isArray(post?.attachments)
      ? post.attachments
          .map((item: any) => {
            const url = String(resolvePostAttachmentMediaUrl(item) || item?.url || '').trim();
            if (!url) return null;
            return {
              id: String(item?.id || item?.fileId || item?.file_id || url).trim(),
              fileId: String(item?.fileId || item?.file_id || item?.file?.id || item?.asset?.id || item?.id || '').trim(),
              url,
              thumbnailUrl: String(resolvePostAttachmentPosterUrl(item) || item?.thumbnailUrl || item?.thumbnail_url || '').trim(),
              mimeType: String(item?.mimeType || item?.mime_type || '').trim(),
              type: item?.type || inferMediaType(item)
            };
          })
          .filter(Boolean)
          .slice(0, 6)
      : [];
    const boostPayload = {
      boostPostId: postId,
      boostSource: 'community-post',
      boostTitle: String(post?.title || '').trim() || 'Promoted Post',
      boostBody: String(post?.content || '').trim(),
      boostSubtitle: String(post?.businessPage?.name || post?.author?.displayName || post?.authorName || '').trim() || 'Community Post',
      boostDestinationUrl: `${window.location.origin}/community/posts/${encodeURIComponent(postId)}`,
      boostCtaText: 'Learn more',
      boostMedia,
      createdAt: new Date().toISOString()
    };
    try {
      window.sessionStorage.setItem('scrolith:my_ads:boost_listing_prefill', JSON.stringify(boostPayload));
    } catch (error) {
      // Best-effort handoff only.
    }
    navigate(`/my-ads?boostPostId=${encodeURIComponent(postId)}&boostOpen=1`, {
      state: boostPayload
    });
  };

  const resolveAuthorId = (post: any) => String(
    post?.authorId ||
    post?.userId ||
    post?.user_id ||
    post?.author?.id ||
    post?.author?.userId ||
    post?.author?.user_id ||
    ''
  );

  const resolveAuthorOwnerUserId = (post: any) => {
    const explicit = String(post?.authorUserId || post?.author_user_id || '').trim();
    if (explicit) return explicit;
    const authorType = String(post?.author?.type || '').toLowerCase();
    if (authorType === 'user') return resolveAuthorId(post);
    return '';
  };

  const canPromotePost = useCallback(
    (post: any) => {
      const viewerId = String(user?.id || '').trim();
      if (!viewerId) return false;
      const directOwnerId = resolveAuthorOwnerUserId(post);
      if (directOwnerId && directOwnerId === viewerId) return true;

      const pageOwnerId = String(post?.businessPage?.ownerId || '').trim();
      if (pageOwnerId && pageOwnerId === viewerId) return true;

      const clubOwnerId = String(post?.club?.ownerId || '').trim();
      if (clubOwnerId && clubOwnerId === viewerId) return true;

      return false;
    },
    [user?.id]
  );

  const beginEditPost = useCallback((post: any) => {
    const policyValue = String(post.commentPolicy || 'everyone').toLowerCase();
    const commentPolicy = (['everyone', 'followers', 'following', 'mutuals', 'none'].includes(policyValue)
      ? policyValue
      : 'everyone') as PostDraft['commentPolicy'];
    setEditingPostId(post.id);
    setEditingDraft({
      title: post.title || '',
      content: post.content || '',
      tags: (post.tags || []).join(', '),
      mentions: (post.mentions || []).join(', '),
      topic: post.topic || '',
      location: post.location || '',
      visibility: (post.visibility as PostDraft['visibility']) || 'public',
      commentPolicy,
      graphicWarning: Boolean(post.graphicWarning),
      isAIEnhanced: Boolean(post.isAIEnhanced),
      aiInsightPreference: resolveStoredPostAiInsightPreference(post.aiInsightEnabled),
      media: (post.attachments || []).map((media: any, index: number) => ({
        localId: `${post.id}-media-${media.id || index}`,
        id: media.id,
        url: media.url,
        name: media.name,
        type: inferMediaType(media)
      }))
    });
  }, []);

  useEffect(() => {
    if (!shouldAutoEdit) return;
    if (!focusPostId) return;
    if (!user?.id) return;
    if (editingPostId) return;
    const target = posts.find((p) => String(p?.id || '') === String(focusPostId));
    if (!target) return;
    const ownerId = resolveAuthorOwnerUserId(target);
    if (!ownerId || String(ownerId) !== String(user.id)) return;
    beginEditPost(target);
  }, [beginEditPost, editingPostId, focusPostId, posts, shouldAutoEdit, user?.id]);

  const cancelEditPost = useCallback(() => {
    setEditingPostId(null);
    setEditingDraft(null);
  }, []);

  const removeEditMedia = useCallback((localId: string) => {
    setEditingDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, media: prev.media.filter((media) => media.localId !== localId) };
    });
  }, []);

  const submitPostEdit = useCallback(async () => {
    if (!user || !editingPostId || !editingDraft) return;
    if (!editingDraft.content.trim()) {
      showNotification('warning', 'Posts', 'Please add content before saving.');
      return;
    }
    if (postActionBusy[editingPostId]) return;
    setPostActionBusy((prev) => ({ ...prev, [editingPostId]: true }));
    try {
      const updated = await CommunityService.updatePost(editingPostId, {
        title: editingDraft.title.trim(),
        content: editingDraft.content,
        attachments: editingDraft.media.map((media) => media.id).filter(Boolean) as string[],
        topic: editingDraft.topic || undefined,
        location: editingDraft.location || undefined,
        visibility: editingDraft.visibility,
        commentPolicy: editingDraft.commentPolicy,
        graphicWarning: editingDraft.graphicWarning,
        isAIEnhanced: editingDraft.isAIEnhanced,
        aiInsightEnabled: postAiInsightPreferenceToBoolean(
          resolvePostAiInsightPreference(editingDraft.aiInsightPreference, 'off')
        )
      });
      if (updated) {
        applyPostUpdate(normalizePost(updated));
      }
      cancelEditPost();
      showNotification('success', 'Posts', 'Post updated.');
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Unable to update post.';
      showNotification('error', 'Posts', message);
    } finally {
      setPostActionBusy((prev) => ({ ...prev, [editingPostId]: false }));
    }
  }, [applyPostUpdate, cancelEditPost, editingDraft, editingPostId, normalizePost, postActionBusy, showNotification, user]);

  const handleDeletePost = useCallback(async (post: any) => {
    if (!user) return;
    if (!confirm('Delete this post?')) return;
    setPostActionBusy((prev) => ({ ...prev, [post.id]: true }));
    try {
      await CommunityService.deletePost(post.id);
      setPosts((prev) => prev.filter((item) => item.id !== post.id));
      setCommentCounts((prev) => {
        const next = { ...prev };
        delete next[post.id];
        return next;
      });
      if (editingPostId === post.id) cancelEditPost();
      showNotification('success', 'Posts', 'Post deleted.');
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Unable to delete post.';
      showNotification('error', 'Posts', message);
    } finally {
      setPostActionBusy((prev) => ({ ...prev, [post.id]: false }));
    }
  }, [cancelEditPost, editingPostId, showNotification, user]);

  const handleTogglePin = useCallback(async (post: any) => {
    if (!user) return;
    const authorId = resolveAuthorOwnerUserId(post);
    if (!authorId || authorId !== String(user.id)) {
      showNotification('warning', 'Pin', 'Only the post author can pin this update.');
      return;
    }
    if (!post.isPinned) {
      const pinnedCount = posts.filter(
        (item) => item.isPinned && resolveAuthorOwnerUserId(item) === String(user.id)
      ).length;
      if (pinnedCount >= 3) {
        showNotification('warning', 'Pin limit', 'You can only pin up to 3 posts.');
        return;
      }
    }
    setPostActionBusy((prev) => ({ ...prev, [post.id]: true }));
    try {
      const updated = await CommunityService.updatePost(post.id, { isPinned: !post.isPinned });
      if (updated) {
        applyPostUpdate(normalizePost(updated));
      }
      showNotification('success', 'Pin', post.isPinned ? 'Post unpinned.' : 'Post pinned to your profile.');
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Unable to update pin status.';
      showNotification('error', 'Pin', message);
    } finally {
      setPostActionBusy((prev) => ({ ...prev, [post.id]: false }));
    }
  }, [applyPostUpdate, normalizePost, posts, showNotification, user]);

  const handleToggleHighlight = useCallback(async (post: any) => {
    if (!user) return;
    const authorId = resolveAuthorOwnerUserId(post);
    if (!authorId || authorId !== String(user.id)) {
      showNotification('warning', 'Highlight', 'Only the post author can highlight this update.');
      return;
    }
    if (!post.isHighlighted) {
      const highlightedCount = posts.filter(
        (item) => item.isHighlighted && resolveAuthorOwnerUserId(item) === String(user.id)
      ).length;
      if (highlightedCount >= 3) {
        showNotification('warning', 'Highlight limit', 'You can only highlight up to 3 posts.');
        return;
      }
    }
    setPostActionBusy((prev) => ({ ...prev, [post.id]: true }));
    try {
      const updated = await CommunityService.updatePost(post.id, { isHighlighted: !post.isHighlighted });
      if (updated) {
        applyPostUpdate(normalizePost(updated));
      }
      showNotification('success', 'Highlight', post.isHighlighted ? 'Post unhighlighted.' : 'Post highlighted on your profile.');
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Unable to update highlight status.';
      showNotification('error', 'Highlight', message);
    } finally {
      setPostActionBusy((prev) => ({ ...prev, [post.id]: false }));
    }
  }, [applyPostUpdate, normalizePost, posts, showNotification, user]);

  const heroBackgroundImage = homepage?.hero?.backgroundImage;
  const showHero = isVisibleForDevice(homepage?.hero?.visibility, viewportDevice);

  useEffect(() => {
    const shouldPreloadHero = showHero && Boolean(heroBackgroundImage);
    upsertImagePreloadLink('community-hero-image', shouldPreloadHero ? heroBackgroundImage : null, {
      fetchPriority: 'high'
    });
    return () => {
      upsertImagePreloadLink('community-hero-image', null);
    };
  }, [heroBackgroundImage, showHero]);

  const loadMorePostsRef = useRef(loadMorePosts);
  loadMorePostsRef.current = loadMorePosts;
  // Attach once the feed (and sentinel) is mounted; avoid re-creating on cursor/loading toggles.
  const communityFeedMounted = !loading || posts.length > 0;
  useEffect(() => {
    if (!communityFeedMounted) return;
    const node = postsSentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          !shouldAllowObserverLoadMore({
            isIntersecting: Boolean(entry?.isIntersecting),
            initialLoading: postsInitialLoadingRef.current,
            loadMoreInFlight: postsLoadingMoreRef.current,
            isTerminal: postsFeedTerminalRef.current,
            hasCursor: Boolean(String(postsNextCursorRef.current || '').trim()),
            offsetFallbackEnabled: postsOffsetFallbackRef.current,
            secondarySourceRemaining: !discoverySupplementUsedRef.current
          })
        ) {
          return;
        }
        void loadMorePostsRef.current();
      },
      { rootMargin: '320px 0px', threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [communityFeedMounted, user?.id]);

  const interestSurveyPostIds = useMemo(
    () =>
      new Set(
        pickInterestSurveyCandidateIds(
          posts.map((post: any) => ({
            id: post?.id,
            authorId: post?.authorUserId || post?.authorId,
            initialSignal: post?.userState?.interestSignal
          })),
          user?.id,
          'post',
          5
        )
      ),
    [posts, user?.id]
  );

  // Full-page skeleton only on first paint with no posts — never unmount feed during soft reloads.
  if (loading && posts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center min-h-[12rem]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading Community...</p>
        </div>
      </div>
    );
  }

  const heroTitle = homepage?.hero?.title || 'Scrolith Community';
  const heroSubtitle = homepage?.hero?.subtitle || 'Connect with fellow freelancers, share knowledge, and grow together';
  const heroBackgroundColor = homepage?.hero?.backgroundColor || '#4f46e5';
  const bannerEnabled = homepage?.banner?.enabled !== false;
  const bannerText = homepage?.banner?.text || 'Security Notice: Do not share sensitive personal information (Passwords, bank details, government IDs). AI Moderation is active in all chats.';
  const modules = homepage?.modules || {};
  const showBanner = bannerEnabled && isVisibleForDevice(homepage?.banner?.visibility, viewportDevice);
  const showSliders = isModuleEnabled(modules, 'sliders', viewportDevice);
  const showStories = isModuleEnabled(modules, 'stories', viewportDevice);
  const showCustomSections = isModuleEnabled(modules, 'customSections', viewportDevice);
  const showSearchBar = isModuleEnabled(modules, 'searchBar', viewportDevice);
  const showFeed = isModuleEnabled(modules, 'feed', viewportDevice);
  const showDiscussions = isModuleEnabled(modules, 'discussions', viewportDevice);
  const showTrendingTopics = isModuleEnabled(modules, 'trendingTopics', viewportDevice);
  const showUpcomingEvents = isModuleEnabled(modules, 'upcomingEvents', viewportDevice);
  const showTopContributors = isModuleEnabled(modules, 'topContributors', viewportDevice);
  const showQuickActions = isModuleEnabled(modules, 'quickActions', viewportDevice);
  const showSponsored = isModuleEnabled(modules, 'sponsored', viewportDevice);
  const showStats = isModuleEnabled(modules, 'stats', viewportDevice);
  const isMobileViewport = viewportDevice === 'mobile';
  const storyActionButtonClass = isMobileViewport
    ? 'inline-flex w-full items-center justify-center gap-1 rounded-2xl border border-gray-200 px-3 py-2 text-[11px] font-semibold text-gray-600'
    : 'inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600';
  const storyPrimaryButtonClass = isMobileViewport
    ? 'inline-flex w-full items-center justify-center gap-1 rounded-2xl bg-gray-900 px-3 py-2 text-[11px] font-semibold text-white'
    : 'inline-flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white';
  const storyLiveButtonClass = isMobileViewport
    ? 'inline-flex w-full items-center justify-center gap-1 rounded-2xl bg-rose-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-rose-700'
    : 'inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-700';

  const showLeftSidebar = showTrendingTopics || showUpcomingEvents || showTopContributors;
  const showRightSidebar =
    showQuickActions ||
    showSponsored ||
    showStats ||
    recommendedCommunityPeople.length > 0 ||
    recommendedCommunityPages.length > 0;

  const mainColSpanClass =
    showLeftSidebar && showRightSidebar
      ? 'lg:col-span-2'
      : showLeftSidebar || showRightSidebar
        ? 'lg:col-span-3'
        : 'lg:col-span-4';

  const visibleSliders = (Array.isArray(homepage?.sliders) ? homepage.sliders : []).filter((slide: any) =>
    isVisibleForDevice(slide?.visibility, viewportDevice)
  );
  const visibleSections = (Array.isArray(homepage?.sections) ? homepage.sections : []).filter((section: any) =>
    isVisibleForDevice(section?.visibility, viewportDevice)
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      {showHero ? (
        <div
          className="relative overflow-hidden py-8 text-white sm:py-16"
          style={{
            backgroundColor: heroBackgroundColor
          }}
        >
          {heroBackgroundImage ? (
            <img
              src={heroBackgroundImage}
              alt=""
              aria-hidden="true"
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <div className="absolute inset-0 bg-slate-950/40" />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950/70 via-slate-900/35 to-indigo-600/20" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative text-center">
              <div className="mx-auto max-w-3xl rounded-[28px] border border-white/15 bg-slate-950/20 px-4 py-6 shadow-2xl backdrop-blur-[2px] sm:px-8 sm:py-10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-100/90">Scrolith Community</p>
                <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-4xl">{heroTitle}</h1>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-blue-100 sm:text-xl">
                  {heroSubtitle}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showBanner && (
        <div className="bg-yellow-50 border-b border-yellow-100">
          <div className="max-w-7xl mx-auto flex items-start gap-3 px-4 py-3 sm:items-center">
            <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-yellow-700">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="text-sm leading-6 text-yellow-900">{bannerText}</div>
          </div>
        </div>
      )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8">
          {/* Left Sidebar */}
          {showLeftSidebar ? (
          <div className="order-2 space-y-4 sm:space-y-6 lg:col-span-1 lg:order-none">
            {/* Trending Topics */}
            {showTrendingTopics && (
              <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
                <div className="flex items-center mb-4">
                  <TrendingUp className="w-5 h-5 text-blue-600 mr-2" />
                  <h2 className="text-lg font-bold">{getModuleTitle(modules, 'trendingTopics', 'Trending Topics')}</h2>
                </div>
                <div className="space-y-3">
                  {trendingTopics.map((topic) => (
                    <Link
                      key={topic.id}
                      to={topic.slug ? `/community/forum?topic=${encodeURIComponent(topic.slug)}` : '/community/forum'}
                      className="block p-3 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <div className="font-medium">{topic.title}</div>
                      <div className="text-sm text-gray-500">{topic.count} posts</div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Events */}
            {showUpcomingEvents && (
              <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
                <div className="flex items-center mb-4">
                  <Calendar className="w-5 h-5 text-green-600 mr-2" />
                  <h2 className="text-lg font-bold">{getModuleTitle(modules, 'upcomingEvents', 'Upcoming Events')}</h2>
                </div>
                <div className="space-y-3">
                  {upcomingEvents.map((event) => (
                    <div key={event.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="font-medium">{event.title}</div>
                      <div className="text-sm text-gray-500">{event.date}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Contributors */}
            {showTopContributors && (
              <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
                <div className="flex items-center mb-4">
                  <Award className="w-5 h-5 text-yellow-600 mr-2" />
                  <h2 className="text-lg font-bold">{getModuleTitle(modules, 'topContributors', 'Top Contributors')}</h2>
                </div>
                <div className="space-y-3">
                  {topContributors.map((contributor) => (
                    <div key={contributor.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-gray-50">
                      <Link to={buildContributorUrl(contributor)} className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-200">
                          {contributor.avatar ? (
                            <img
                              src={resolveUserAvatarUrl(contributor.avatar) || resolvePostAttachmentMediaUrl(contributor.avatar)}
                              alt={contributor.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center font-bold">
                              {String(contributor.name || 'C').charAt(0)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{contributor.name}</div>
                          <div className="text-sm text-gray-500">{contributor.reputation} rep</div>
                        </div>
                      </Link>
                      <FollowButton
                        targetUserId={contributor.id}
                        currentUserId={user?.id}
                        initialIsFollowing={followStateMap[contributor.id]}
                        className="h-7 px-2 text-[11px]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          ) : null}

          {/* Main Content */}
          <div className={`${mainColSpanClass} order-1 space-y-4 sm:space-y-6 lg:order-none`}>
            {showSliders && visibleSliders.length > 0 && (
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <div className="mb-2 text-sm font-bold text-gray-900">
                  {getModuleTitle(modules, 'sliders', 'Featured')}
                </div>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {visibleSliders.map((slide: any) => (
                    <div key={slide.id} className="min-w-[260px] border rounded-lg overflow-hidden">
                      {slide.imageUrl && (
                        <OptimizedImage
                          src={resolveAssetUrl(slide.imageUrl)}
                          alt={slide.title || 'Slide'}
                          width={640}
                          height={256}
                          sizes="(max-width: 768px) 100vw, 320px"
                          className="w-full h-32 object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                      {slide.videoUrl && (
                        <video src={resolveAssetUrl(slide.videoUrl)} controls className="w-full h-32 object-cover" />
                      )}
                      <div className="p-3">
                        <div className="font-semibold text-sm">{slide.title}</div>
                        <div className="text-xs text-gray-500">{slide.subtitle}</div>
                        {slide.ctaUrl && (
                          <a href={slide.ctaUrl} className="text-xs text-blue-600 hover:text-blue-800">{slide.ctaLabel || 'Learn more'}</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stories Strip */}
            {showStories && (
              <div className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 p-1">
                    <button
                      type="button"
                      onClick={() => setStoryRailTab('stories')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        storyRailTab === 'stories' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {getModuleTitle(modules, 'stories', 'Stories')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStoryRailTab('reels')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        storyRailTab === 'reels' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      Scroll
                    </button>
                  </div>

                  {storyRailTab === 'stories' ? (
                    <div className="space-y-3">
                      <div className={`grid gap-2 ${isMobileViewport ? 'grid-cols-2' : 'flex flex-wrap items-center'}`}>
                        <select
                          value={storyDraft.visibility}
                          onChange={(event) =>
                            setStoryDraft((prev) => ({ ...prev, visibility: normalizeStoryVisibility(event.target.value) }))
                          }
                          className={`${isMobileViewport ? 'rounded-2xl px-3 py-2 text-[11px]' : 'rounded-full px-3 py-1 text-xs'} border border-gray-200 font-semibold text-gray-600`}
                        >
                          {storyVisibilityOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => setStoryTextOpen(true)}
                          className={storyActionButtonClass}
                          disabled={storyPosting}
                        >
                          Text story
                        </button>
                        <button
                          onClick={() => storyDeviceInputRef.current?.click()}
                          className={storyActionButtonClass}
                          disabled={storyPosting}
                        >
                          <Plus className="h-3 w-3" />
                          From device
                        </button>
                        <button
                          onClick={startStoryCamera}
                          className={storyPrimaryButtonClass}
                          disabled={storyPosting}
                        >
                          <CameraIcon className="h-3 w-3" />
                          Camera
                        </button>
                        {liveFeatureStatus.enabled ? (
                          <button
                            type="button"
                            onClick={() => navigate('/live/studio')}
                            className={storyLiveButtonClass}
                          >
                            Go Live
                          </button>
                        ) : null}
                      </div>
                      {storyMediaUploadLabel ? (
                        <StoryUploadStatusCard
                          busy={storyMediaUploadBusy}
                          label={storyMediaUploadLabel}
                          progress={storyMediaUploadProgress}
                          hint={
                            storyMediaUploadBusy
                              ? 'Scrolith is uploading and preparing your selected story media.'
                              : 'Your story upload is ready for the next step.'
                          }
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div className={`grid gap-2 ${isMobileViewport ? 'grid-cols-2' : 'flex flex-wrap items-center'}`}>
                      <button
                        type="button"
                        onClick={() => setScrollCreateOpen(true)}
                        className={storyPrimaryButtonClass}
                      >
                        <Plus className="h-3 w-3" />
                        Create Scroll
                      </button>
                      {liveFeatureStatus.enabled ? (
                        <button
                          type="button"
                          onClick={() => navigate('/live/studio')}
                          className={`${isMobileViewport ? 'inline-flex w-full items-center justify-center gap-1 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100' : 'inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100'}`}
                        >
                          Go Live
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>

                {storyRailTab === 'stories' ? (
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide sm:gap-3">
                    <button
                      onClick={() => storyDeviceInputRef.current?.click()}
                      className="flex h-48 min-w-[118px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 text-xs text-gray-500 sm:h-52 sm:min-w-[132px]"
                    >
                      <Plus className="h-5 w-5 mb-2" />
                      Your story
                    </button>
                    {storiesLoading ? (
                      <div className="text-xs text-gray-400">Loading stories...</div>
                    ) : stories.length === 0 ? (
                      <div className="text-xs text-gray-400">No stories yet.</div>
                    ) : (
                      stories.map((story) => (
                        <button
                          key={story.id}
                          onClick={() => openStory(story)}
                          className="relative h-48 min-w-[118px] overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 sm:h-52 sm:min-w-[132px]"
                        >
                          {(() => {
                            const media = resolveStoryMedia(story);
                            const text = resolveStoryContent(story);
                            const isTextStory = String(story?.type || '').trim().toLowerCase() === 'text';
                            if (isTextStory && text) {
                              const style = getStoryTextStyle(story);
                              return (
                                <div
                                  className="flex h-full w-full items-center justify-center px-3 text-center text-xs font-semibold"
                                  style={{
                                    background: style.background,
                                    color: style.color,
                                    fontFamily: style.fontFamily,
                                    textAlign: style.textAlign as any
                                  }}
                                >
                                  <StaticPreviewText
                                    text={text}
                                    className="line-clamp-4"
                                    textClassName="whitespace-pre-wrap break-words"
                                    moreClassName="opacity-90"
                                  />
                                </div>
                              );
                            }
                            if (media.src) {
                              return media.kind === 'video' ? (
                                <InlineAutoplayVideo
                                  key={String(story?.id || media.src)}
                                  src={media.src}
                                  poster={media.poster}
                                  className="h-full w-full object-cover"
                                  containerClassName="h-full w-full"
                                  controls={false}
                                  loop
                                  preload="metadata"
                                  autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY}
                                  showMuteToggle={false}
                                />
                              ) : (
                                <OptimizedImage
                                  src={media.src}
                                  alt="Story"
                                  width={720}
                                  height={1280}
                                  sizes="(max-width: 768px) 100vw, 360px"
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                              );
                            }
                            if (text) {
                              const style = getStoryTextStyle(story);
                              return (
                                <div
                                  className="flex h-full w-full items-center justify-center px-3 text-center text-xs font-semibold"
                                  style={{
                                    background: style.background,
                                    color: style.color,
                                    fontFamily: style.fontFamily,
                                    textAlign: style.textAlign as any
                                  }}
                                >
                                  <StaticPreviewText
                                    text={text}
                                    className="line-clamp-4"
                                    textClassName="whitespace-pre-wrap break-words"
                                    moreClassName="opacity-90"
                                  />
                                </div>
                              );
                            }
                            return (
                              <div className="h-full w-full flex items-center justify-center text-xs text-gray-500">Story</div>
                            );
                          })()}
                          {(() => {
                            const authorName = resolveStoryAuthorName(story, 'Community');
                            const authorAvatar = resolveStoryAuthorAvatar(story, user);
                            const authorInitial = resolveStoryAuthorInitial(story);
                            return (
                              <StoryAuthorAvatar
                                src={authorAvatar}
                                name={authorName}
                                initial={authorInitial}
                                className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-white/90 bg-slate-700 text-[11px] font-semibold text-white shadow"
                                width={56}
                                height={56}
                                sizes="28px"
                              />
                            );
                          })()}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-left">
                            <p className="text-[10px] text-white font-semibold line-clamp-1">{resolveStoryAuthorName(story, 'Community')}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide sm:gap-3">
                    <button
                      type="button"
                      onClick={() => setScrollCreateOpen(true)}
                      className="flex h-48 min-w-[118px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 text-xs text-gray-500 sm:h-52 sm:min-w-[132px]"
                    >
                      <Plus className="h-5 w-5 mb-2" />
                      Create Scroll
                    </button>
                    {reelsLoading ? (
                      <div className="text-xs text-gray-400">Loading Scroll videos...</div>
                    ) : reels.length === 0 ? (
                      <div className="text-xs text-gray-400">No Scroll videos yet.</div>
                    ) : (
                      reels.map((scroll) => (
                        <button
                          key={scroll.id}
                          type="button"
                          onClick={() => navigate(`/scroll?scroll=${encodeURIComponent(scroll.id)}`)}
                          className="relative h-48 min-w-[118px] overflow-hidden rounded-2xl border border-gray-200 bg-gray-900 sm:h-52 sm:min-w-[132px]"
                        >
                          {(() => {
                            const media = resolveReelMedia(scroll);
                            if (!media.src) {
                              return (
                                <div className="h-full w-full flex items-center justify-center text-xs text-white/75">
                                  Scroll
                                </div>
                              );
                            }
                            return (
                              <InlineAutoplayVideo
                                key={String(scroll?.id || media.src)}
                                src={media.src}
                                poster={media.poster}
                                className="h-full w-full object-cover"
                                containerClassName="h-full w-full"
                                controls={false}
                                loop
                                preload="metadata"
                                autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY}
                                showMuteToggle={false}
                              />
                            );
                          })()}
                          {(() => {
                            const authorName = resolveReelAuthorName(scroll, 'Scrolith');
                            const authorAvatar = resolveReelAuthorAvatar(scroll);
                            const authorInitial = resolveReelAuthorInitial(scroll);
                            return (
                              <div className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-blue-300/90 bg-slate-700 text-[11px] font-semibold text-white shadow">
                                {authorAvatar ? (
                                  <OptimizedImage
                                    src={authorAvatar}
                                    alt={authorName}
                                    width={96}
                                    height={96}
                                    sizes="48px"
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  <span>{authorInitial}</span>
                                )}
                              </div>
                            );
                          })()}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left">
                            <p className="text-[10px] font-semibold text-white line-clamp-1">{resolveReelAuthorName(scroll, 'Scrolith')}</p>
                            <p className="text-[10px] text-white/80 line-clamp-1">{scroll.title || scroll.description || 'Scroll'}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            <LiveFeaturedRail
              surface="communityHome"
              title="Featured Live Streams"
              subtitle="Watch active livestreams from the community without leaving your web or mobile feed."
              className="mt-4"
            />

            {showCustomSections && visibleSections.length > 0 && (
              <div className="space-y-4">
                {visibleSections.map((section: any) => (
                  <div key={section.id} className="rounded-xl bg-white p-4 shadow-sm">
                    {section.title && <h3 className="text-lg font-semibold">{section.title}</h3>}
                    {section.body && <p className="text-sm text-gray-600 mt-2">{section.body}</p>}
                    {section.type === 'image' && section.imageUrl && (
                      <OptimizedImage
                        src={resolveAssetUrl(section.imageUrl)}
                        alt={section.title || 'Section'}
                        width={960}
                        height={540}
                        sizes="(max-width: 1024px) 100vw, 720px"
                        className="mt-3 rounded-lg w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    {section.type === 'video' && section.videoUrl && (
                      <video src={resolveAssetUrl(section.videoUrl)} controls className="mt-3 rounded-lg w-full" />
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Search Bar */}
            {showSearchBar && (
              <div className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
                <SearchInput
                  placeholder={isMobileViewport ? 'Search jobs, gigs, people...' : 'Search discussions, topics, or people...'}
                  searchPath="/search"
                  className="w-full"
                  showButton
                  buttonLabel={isMobileViewport ? 'Search' : 'Search'}
                  buttonAriaLabel="Search community content"
                />
              </div>
            )}

            {/* Community Feed */}
            {showFeed && (
              <div className="rounded-xl bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-base font-bold sm:text-lg">{getModuleTitle(modules, 'feed', 'Community Feed')}</h2>
                <Link to="/community" className="inline-flex self-start rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 sm:self-auto sm:text-sm">Create Post</Link>
              </div>
              <div className="space-y-4 bg-slate-50/40 p-3 sm:p-4">
                {posts.length === 0 && (
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-gray-500 shadow-sm">No posts yet.</div>
                )}
                {posts.map((post) => {
                  const ownerUserId = resolveAuthorOwnerUserId(post);
                  const isOwner = Boolean(ownerUserId) && String(user?.id || '') === ownerUserId;
                  const canManage = isOwner || isPrivilegedRole(user?.role);
                  const canPromote = canPromotePost(post);
                  const isEditing = editingPostId === post.id;
                  const actionBusy = Boolean(postActionBusy[post.id]);
                  const commentCount = commentCounts[post.id] ?? post.interactions?.comments ?? 0;
                  const resolvedAuthor = {
                    id: post.author?.id || post.authorId,
                    username: post.author?.username ?? post.authorUsername,
                    displayName: post.author?.displayName || post.authorName,
                    avatarUrl: resolveUserAvatarUrl(post.author || post) || post.authorAvatar,
                    type: post.author?.type || (post.businessPage ? 'business' : 'user'),
                    businessSlug: post.author?.businessSlug || post.businessPage?.slug || null,
                    isVerified: post.author?.isVerified,
                    isPro: post.author?.isPro
                  };
                  const followTargetId =
                    String(resolvedAuthor.type || '').toLowerCase() === 'user'
                      ? String(resolvedAuthor.id || '')
                      : '';
                  const initialIsFollowing =
                    followTargetId ? (followStateMap[followTargetId] ?? post.viewer?.isFollowingAuthor) : undefined;
                  return (
                    <article
                      key={getStableFeedReactKey(post)}
                      id={`community-post-${post.id}`}
                      className={`overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-22px_rgba(15,23,42,0.28)] transition-shadow duration-150 hover:shadow-[0_2px_8px_rgba(15,23,42,0.06),0_16px_36px_-22px_rgba(15,23,42,0.32)] sm:p-6 ${focusPostId === post.id ? 'ring-2 ring-blue-100' : ''}`}
                    >
                      <PostHeader
                        author={resolvedAuthor}
                        createdAt={post.createdAt}
                        currentUserId={user?.id}
                        initialIsFollowing={initialIsFollowing}
                        onRequireLogin={() => {
                          if (confirm('Log in to follow users?')) window.location.href = '/auth/login';
                        }}
                        onFollowSuccess={(isFollowingNow) => {
                          if (!resolvedAuthor.displayName) return;
                          showNotification(
                            'success',
                            isFollowingNow ? 'Following' : 'Unfollowed',
                            isFollowingNow
                              ? `You are now following ${resolvedAuthor.displayName}.`
                              : `You are no longer following ${resolvedAuthor.displayName}.`
                          );
                        }}
                        onFollowError={(message) => showNotification('error', 'Follow failed', message)}
                        metaBadges={
                          <>
                            {post.isPinned && (
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">Pinned</span>
                            )}
                            {post.isHighlighted && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Highlighted</span>
                            )}
                            {post.isAIEnhanced && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                <Sparkles className="h-3 w-3" />
                                AI-enhanced
                              </span>
                            )}
                            {post.graphicWarning && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                <AlertTriangle className="h-3 w-3" />
                                {GRAPHIC_WARNING_LABEL}
                              </span>
                            )}
                          </>
                        }
                        rightSlot={
                          <div className="flex min-w-fit items-center gap-2 whitespace-nowrap">
                            {canPromote ? (
                              <button
                                onClick={() => promotePost(post)}
                                className="rounded-full border border-indigo-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-600 shadow-sm transition hover:bg-indigo-50 sm:px-3 sm:text-[11px] sm:tracking-[0.16em]"
                                type="button"
                              >
                                {isMobileViewport ? 'Promote' : 'Promote this post'}
                              </button>
                            ) : null}
                            <PostOptionsButton
                              post={post}
                              buttonClassName="rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:p-2.5"
                              onHideFromFeed={(postId) => {
                                setPosts((prev) => prev.filter((item) => item.id !== postId));
                              }}
                              onEditPost={() => beginEditPost(post)}
                              onDeletePost={() => handleDeletePost(post)}
                              onTogglePin={isOwner ? () => handleTogglePin(post) : undefined}
                              onToggleHighlight={isOwner ? () => handleToggleHighlight(post) : undefined}
                            />
                          </div>
                        }
                      />

                      {isEditing ? (
                        <div className="mt-4 space-y-3">
                          <input
                            value={editingDraft?.title || ''}
                            onChange={(event) =>
                              setEditingDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))
                            }
                            placeholder="Post title (optional)"
                            className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600"
                          />
                          <MentionHashtagTextarea
                            value={editingDraft?.content || ''}
                            onChange={(nextValue) =>
                              setEditingDraft((prev) => (prev ? { ...prev, content: nextValue } : prev))
                            }
                            className="min-h-[120px] w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-700"
                          />
                          <div className="text-xs text-gray-500">Tip: type @ to mention people and # to add tags.</div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700">
                              <input
                                type="checkbox"
                                checked={Boolean(editingDraft?.graphicWarning)}
                                onChange={(event) =>
                                  setEditingDraft((prev) =>
                                    prev ? { ...prev, graphicWarning: event.target.checked } : prev
                                  )
                                }
                              />
                              <span className="inline-flex items-center gap-1">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                {GRAPHIC_WARNING_LABEL}
                              </span>
                            </label>
                            <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700">
                              <input
                                type="checkbox"
                                checked={Boolean(editingDraft?.isAIEnhanced)}
                                onChange={(event) =>
                                  setEditingDraft((prev) =>
                                    prev ? { ...prev, isAIEnhanced: event.target.checked } : prev
                                  )
                                }
                              />
                              <span className="inline-flex items-center gap-1">
                                <Sparkles className="h-4 w-4 text-emerald-600" />
                                Mark as AI-enhanced
                              </span>
                            </label>
                            <label className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                              <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Scrolitha AI insight
                              </span>
                              <select
                                value={editingDraft?.aiInsightPreference || 'off'}
                                onChange={(event) =>
                                  setEditingDraft((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          aiInsightPreference: resolvePostAiInsightPreference(event.target.value, 'off')
                                        }
                                      : prev
                                  )
                                }
                                className="mt-2 w-full bg-transparent text-sm font-semibold text-gray-900 outline-none"
                              >
                                <option value="on">Generate for this post</option>
                                <option value="off">Do not generate</option>
                              </select>
                            </label>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <select
                              value={editingDraft?.visibility || 'public'}
                              onChange={(event) =>
                                setEditingDraft((prev) =>
                                  prev ? { ...prev, visibility: event.target.value as PostDraft['visibility'] } : prev
                                )
                              }
                              className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600"
                            >
                              <option value="public">Public</option>
                              <option value="network">Network</option>
                              <option value="friends">Friends</option>
                              <option value="private">Private</option>
                            </select>
                            <select
                              value={editingDraft?.commentPolicy || 'everyone'}
                              onChange={(event) =>
                                setEditingDraft((prev) =>
                                  prev ? { ...prev, commentPolicy: event.target.value as PostDraft['commentPolicy'] } : prev
                                )
                              }
                              className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600"
                            >
                              {commentPolicyOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <input
                              value={editingDraft?.topic || ''}
                              onChange={(event) =>
                                setEditingDraft((prev) => (prev ? { ...prev, topic: event.target.value } : prev))
                              }
                              placeholder="Topic (optional)"
                              className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600"
                            />
                            <input
                              value={editingDraft?.location || ''}
                              onChange={(event) =>
                                setEditingDraft((prev) => (prev ? { ...prev, location: event.target.value } : prev))
                              }
                              placeholder="Location (optional)"
                              className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600"
                            />
                          </div>
                          {editingDraft?.media?.length ? (
                            <div className="grid gap-3 md:grid-cols-2">
                              {editingDraft.media.map((media) => {
                                const type = media.type || inferMediaType(media);
                                const mediaUrl = resolvePostAttachmentMediaUrl(media) || resolveAssetUrl(media?.url) || media?.url;
                                const posterUrl = resolvePostAttachmentPosterUrl(media) || media?.thumbnailUrl || mediaUrl;
                                return (
                                  <div key={media.localId} className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                                    <button
                                      type="button"
                                      onClick={() => removeEditMedia(media.localId)}
                                      className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-1 text-gray-500 hover:text-gray-700"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                    {type === 'video' ? (
                                      <video src={mediaUrl} poster={posterUrl || undefined} className="h-40 w-full object-cover" controls />
                                    ) : type === 'image' ? (
                                      <OptimizedImage
                                        src={posterUrl}
                                        fallbackSrc={mediaUrl}
                                        alt={media.name || 'Post media'}
                                        width={960}
                                        height={540}
                                        sizes="(max-width: 1280px) 100vw, 420px"
                                        className="h-40 w-full object-cover"
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    ) : (
                                      <div className="flex h-40 w-full items-center justify-center p-4 text-xs text-gray-500">
                                        {media.name || 'Attachment'}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEditPost}
                              className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={submitPostEdit}
                              disabled={actionBusy}
                              className="rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold uppercase text-white disabled:opacity-60"
                            >
                              {actionBusy ? 'Saving...' : 'Save changes'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="mt-4 space-y-4">
                          {focusPostId === post.id && focusMentionToken ? (
                            <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                              You were mentioned in this post.
                            </div>
                          ) : null}
                          <PostOriginPreview originalPost={post.originalPost} className="mt-2" />
                          <TranslatablePostText
                            post={post}
                            viewerId={user?.id}
                            viewerUsername={user?.username}
                            mentionToken={focusPostId === post.id ? focusMentionToken : undefined}
                            expandable
                            titleClassName="text-left text-xl font-semibold leading-tight tracking-tight text-slate-950 transition hover:text-slate-700 [overflow-wrap:anywhere]"
                            contentWrapperClassName="cursor-pointer text-[15px] leading-[1.78] text-slate-700 [overflow-wrap:anywhere]"
                            buttonClassName="text-slate-900"
                            translationRowClassName="text-slate-500"
                            onTitleClick={() => openPostCard(post)}
                            onContentClick={(event) => openPostFromText(event, post)}
                            onContentKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openPostCard(post);
                              }
                            }}
                          />
                          {post.tags?.length ? (
                            <div className="flex flex-wrap gap-2">
                              {post.tags.map((tag: string) => (
                                <span key={tag} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <ContentOfferTags offerTags={post.offerTags} />
                          {post.aiInsightGenerated && post.aiInsightText ? (
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                  <Sparkles className="h-3.5 w-3.5" />
                                  AI Insight
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInsightCollapsedByPost((prev) => ({
                                      ...prev,
                                      [post.id]: !(prev[post.id] ?? true)
                                    }))
                                  }
                                  className="text-[11px] font-semibold text-emerald-700 hover:underline"
                                >
                                  {(insightCollapsedByPost[post.id] ?? true) ? 'Show' : 'Hide'}
                                </button>
                              </div>
                              {!(insightCollapsedByPost[post.id] ?? true) ? (
                                <p className="mt-2 text-sm text-emerald-900">{post.aiInsightText}</p>
                              ) : null}
                            </div>
                          ) : null}
                          {(post.topic || post.location) && (
                            <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                              {post.topic && (
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm">Topic: {post.topic}</span>
                              )}
                              {post.location && (
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm">Location: {post.location}</span>
                              )}
                            </div>
                          )}
                          {Array.isArray(post.attachments) && post.attachments.length > 0 && (
                            <GraphicWarningGate
                              active={Boolean(post.graphicWarning)}
                              revealed={Boolean(revealedGraphicPosts[post.id])}
                              onReveal={() => setRevealedGraphicPosts((prev) => ({ ...prev, [post.id]: true }))}
                              label={GRAPHIC_WARNING_LABEL}
                            >
                              <div
                                className={`grid gap-3 ${
                                  post.attachments.length === 1 ? 'grid-cols-1' : 'md:grid-cols-2'
                                }`}
                              >
                                {post.attachments.map((media: any) => {
                                  const type = inferMediaType(media || {});
                                  const mediaKey = String(media.id || media.url || '');
                                  const mediaUrl = String(resolvePostAttachmentMediaUrl(media) || resolveAssetUrl(media?.url) || '').trim();
                                  const posterUrl = String(resolvePostAttachmentPosterUrl(media) || media?.thumbnailUrl || mediaUrl).trim();
                                  const mediaHeightClass =
                                    post.attachments.length === 1
                                      ? FEED_SINGLE_MEDIA_HEIGHT_CLASS
                                      : FEED_MULTI_MEDIA_HEIGHT_CLASS;
                                  if (type === 'video') {
                                    return (
                                      <div
                                        key={media.id || media.url}
                                        role="button"
                                        tabIndex={0}
                                        onClick={(event) => {
                                          if ((event.target as HTMLElement | null)?.closest('[data-inline-video-control=\"true\"]')) return;
                                          queueOpenPostFromMediaTap(post, media, mediaKey);
                                        }}
                                        onDoubleClick={(event) => {
                                          if ((event.target as HTMLElement | null)?.closest('[data-inline-video-control=\"true\"]')) return;
                                          onPostMediaDoubleClick(event, post, mediaKey);
                                        }}
                                        onTouchEnd={(event) => onPostMediaTouchEnd(event, post, mediaKey)}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            handlePostMediaPrimaryAction(post, media);
                                          }
                                        }}
                                        className="mx-auto w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm"
                                      >
                                        <InlineAutoplayVideo
                                          src={mediaUrl}
                                          poster={posterUrl || undefined}
                                          className={`${mediaHeightClass} w-full object-cover`}
                                          controls={false}
                                          autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY}
                                          preload="metadata"
                                          overlay={(videoElement) => (
                                            <PostVideoActionBar
                                              postId={post.id}
                                              postTitle={post.title}
                                              postContent={post.content}
                                              postLocation={post.location}
                                              media={media}
                                              videoElement={videoElement}
                                            />
                                          )}
                                        />
                                      </div>
                                    );
                                  }
                                  if (type === 'image') {
                                    return (
                                      <button
                                        key={media.id || media.url}
                                        type="button"
                                        onClick={() => handlePostMediaPrimaryAction(post, media)}
                                        onDoubleClick={(event) => onPostMediaDoubleClick(event, post, mediaKey)}
                                        onTouchEnd={(event) => onPostMediaTouchEnd(event, post, mediaKey)}
                                        className="mx-auto w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left shadow-sm"
                                      >
                                        <OptimizedImage
                                          src={posterUrl}
                                          fallbackSrc={mediaUrl}
                                          alt={media.name || 'Post media'}
                                          width={960}
                                          height={540}
                                          sizes="(max-width: 1024px) 100vw, 50vw"
                                          className={`${mediaHeightClass} w-full object-cover`}
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      </button>
                                    );
                                  }
                                  return (
                                    <button
                                      key={media.id || media.url}
                                      type="button"
                                      onClick={() => handlePostMediaPrimaryAction(post, media)}
                                      className="rounded-2xl border border-slate-200 bg-white p-3 text-left text-xs text-slate-600 shadow-sm hover:bg-slate-50"
                                    >
                                      <span className="text-blue-600 underline">
                                        {media.name || mediaUrl.split('/').pop() || 'View attachment'}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </GraphicWarningGate>
                          )}
                          <PostEngagementBar
                            postId={post.id}
                            postTitle={post.title}
                            postContent={post.content}
                            authorId={post.authorUserId || post.authorId}
                            dashGcoinTotal={Number((post as any).dashGcoinTotal ?? post.interactions?.dashGcoinTotal ?? 0)}
                            commentPolicy={post.commentPolicy}
                            postRepostsEnabled={post.repostsEnabled}
                            commentCount={commentCount}
                            repostCount={post.repostsCount ?? post.interactions?.reposts ?? 0}
                            shareCount={post.sharesCount ?? post.interactions?.shares ?? 0}
                            viewCount={post.interactions?.views ?? post.viewsCount ?? 0}
                            initialReactionCounts={post.interactions?.reactions}
                            initialUserReaction={post.userState?.reaction}
                            interestSurveyEnabled={interestSurveyPostIds.has(post.id)}
                            initialInterestSignal={post.userState?.interestSignal}
                            focusCommentId={focusPostId === post.id ? focusCommentId : undefined}
                            focusMentionToken={focusPostId === post.id ? focusMentionToken : undefined}
                            onCommentCountChange={syncCommentCount}
                          />
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
                <div ref={postsSentinelRef} className="h-10 shrink-0" aria-hidden="true" />
                {postsLoadingMore ? (
                  <div
                    className="min-h-[3rem] rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm"
                    role="status"
                    aria-live="polite"
                  >
                    Loading more posts...
                  </div>
                ) : postsFeedTerminal ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500 shadow-sm">
                    You&apos;re all caught up. No more unique community posts right now.
                  </div>
                ) : postsNextCursor || postsOffsetFallbackEnabled || !discoverySupplementUsedRef.current ? (
                  <div className="flex justify-center pb-2">
                    <button
                      type="button"
                      onClick={() => void loadMorePosts()}
                      className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                    >
                      Load more
                    </button>
                  </div>
                ) : null}
              </div>
              </div>
            )}

            {/* Discussions List */}
            {showDiscussions && (
            <div className="rounded-xl bg-white shadow-sm">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-bold">{getModuleTitle(modules, 'discussions', 'Latest Discussions')}</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {discussions.map((discussion) => (
                  <Link key={discussion.id} to={`/community/thread/${discussion.id}`} className="block p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-900">{discussion.title}</h3>
                        <div className="flex items-center text-sm text-gray-500 mt-1">
                          <span>by {discussion.author}</span>
                          <span className="mx-2">&middot;</span>
                          <span>{discussion.lastReply}</span>
                        </div>
                      </div>
                      <div className="flex items-center text-sm text-gray-500">
                        <MessageCircle className="w-4 h-4 mr-1" />
                        {discussion.replies}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
            )}
          </div>

          {/* Right Sidebar */}
          {showRightSidebar ? (
          <div className="order-3 space-y-4 sm:space-y-6 lg:col-span-1 lg:order-none">
            {/* Quick Actions */}
            {showQuickActions && (
            <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold mb-4">{getModuleTitle(modules, 'quickActions', 'Quick Actions')}</h2>
              <div className="space-y-3">
                <Link to="/community/forum?create=1" className="block w-full text-center bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700">
                  Start Discussion
                </Link>
                <Link to="/community/gcoin" className="block w-full text-center bg-yellow-500 text-white py-2 px-4 rounded-lg hover:bg-yellow-600">
                  Gcoin Dashboard
                </Link>
                <Link to="/community/events" className="block w-full text-center bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700">
                  Join Event
                </Link>
                <Link to="/community/resources" className="block w-full text-center bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700">
                  Knowledge Hub
                </Link>
              </div>
            </div>
            )}

            {recommendedCommunityPeople.length > 0 ? (
              <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
                <h2 className="mb-4 text-lg font-bold">People to follow</h2>
                <div className="space-y-3">
                  {recommendedCommunityPeople.map((person) => {
                    const avatar = resolveUserAvatarUrl(person.avatar) || resolvePostAttachmentMediaUrl(person.avatar);
                    return (
                      <div key={person.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3">
                        <Link to={buildContributorUrl(person)} className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-100">
                            {avatar ? (
                              <OptimizedImage
                                src={avatar}
                                alt={person.name}
                                width={96}
                                height={96}
                                sizes="56px"
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-sm font-bold text-gray-500">
                                {String(person.name || 'U').charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-gray-900">{person.name}</div>
                            <div className="truncate text-xs text-gray-500">{person.headline}</div>
                          </div>
                        </Link>
                        <FollowButton
                          targetUserId={person.id}
                          currentUserId={user?.id}
                          initialIsFollowing={Boolean(person.isFollowing || followStateMap[person.id])}
                          className="h-7 px-2 text-[11px]"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {recommendedCommunityPages.length > 0 ? (
              <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
                <h2 className="mb-4 text-lg font-bold">Pages to follow</h2>
                <div className="space-y-3">
                  {recommendedCommunityPages.map((page) => {
                    const avatar = resolvePostAttachmentMediaUrl(page.avatar);
                    return (
                      <div key={page.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3">
                        <Link to={buildCommunityPageUrl(page)} className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-100">
                            {avatar ? (
                              <OptimizedImage
                                src={avatar}
                                alt={page.name}
                                width={96}
                                height={96}
                                sizes="56px"
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-sm font-bold text-gray-500">
                                {String(page.name || 'P').charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-gray-900">{page.name}</div>
                            <div className="truncate text-xs text-gray-500">{page.tagline || `${page.followersCount || 0} followers`}</div>
                          </div>
                        </Link>
                        <button
                          type="button"
                          disabled={Boolean(pageFollowBusy[page.id])}
                          onClick={() => handleCommunityPageFollow(page)}
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase ${
                            page.isFollowing ? 'border-gray-300 text-gray-700' : 'border-blue-200 text-blue-600'
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          {pageFollowBusy[page.id] ? '...' : page.isFollowing ? 'Following' : 'Follow'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Ads/Sponsored */}
            {showSponsored && (
            <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold mb-4">{getModuleTitle(modules, 'sponsored', 'Sponsored')}</h2>
              <div className="space-y-4">
                {ads.map((ad) => {
                  return (
                    <AdCard
                      key={ad.id}
                      ad={{
                        ...(ad as any),
                        destinationUrl: (ad as any).destinationUrl || (ad as any).ctaUrl || null,
                        body: (ad as any).body || (ad as any).description || ''
                      }}
                      showDonate={Boolean((ad as any).creatorId || (ad as any).recipientId)}
                      compact
                      className="mb-0"
                    />
                  );
                })}
              </div>
            </div>
            )}

            {/* Stats */}
            {showStats && (
            <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold mb-4">{getModuleTitle(modules, 'stats', 'Community Stats')}</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{formatCompactCount(communityStats.members)}</div>
                  <div className="text-sm text-gray-500">Members</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{formatCompactCount(communityStats.discussions)}</div>
                  <div className="text-sm text-gray-500">Discussions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{formatCompactCount(communityStats.topics)}</div>
                  <div className="text-sm text-gray-500">Topics</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{formatCompactCount(communityStats.events)}</div>
                  <div className="text-sm text-gray-500">Events</div>
                </div>
              </div>
            </div>
            )}
          </div>
          ) : null}
        </div>
      </div>

      <input
        ref={storyDeviceInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleStoryDeviceSelection}
      />
      <input
        ref={storyCameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={handleStoryDeviceSelection}
      />

      <ScrollCreateModal
        open={scrollCreateOpen}
        onClose={() => setScrollCreateOpen(false)}
        config={scrollConfig}
        onCreated={(created) => {
          setReels((prev) => [created, ...prev.filter((item) => item.id !== created.id)].slice(0, 18));
          setStoryRailTab('reels');
        }}
      />

      {storyTextOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Text story</h3>
              <button onClick={() => setStoryTextOpen(false)} className="text-gray-500 hover:text-gray-700" type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="overflow-hidden rounded-2xl border border-gray-200">
                <div
                  className="flex h-48 w-full items-center justify-center px-5 text-center"
                  style={{
                    background: storyPreviewStyle.background,
                    color: storyPreviewStyle.color,
                    fontFamily: storyPreviewStyle.fontFamily,
                    textAlign: storyPreviewStyle.textAlign as any
                  }}
                >
                  <p className="text-lg font-semibold leading-snug whitespace-pre-wrap">
                    {storyDraft.content.trim() ? storyDraft.content : 'Type a status'}
                  </p>
                </div>
              </div>

              <textarea
                value={storyDraft.content}
                onChange={(event) => setStoryDraft((prev) => ({ ...prev, content: event.target.value }))}
                placeholder="Share a short story..."
                className="min-h-[140px] w-full rounded-2xl border border-gray-200 p-3 text-sm text-gray-700"
              />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Background</p>
                <div className="mt-2 flex flex-wrap gap-2">
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
                      className={`h-8 w-8 rounded-full border ${storyDraft.textBackground === theme.background ? 'border-gray-900 ring-2 ring-gray-300' : 'border-white/70'} shadow-sm`}
                      style={{ background: theme.background }}
                      title={theme.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Font</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {storyTextFonts.map((font) => (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => setStoryDraft((prev) => ({ ...prev, textFont: font.fontFamily }))}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        storyDraft.textFont === font.fontFamily ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600'
                      }`}
                      style={{ fontFamily: font.fontFamily }}
                    >
                      {font.label}
                    </button>
                  ))}
                </div>
              </div>

              <select
                value={storyDraft.visibility}
                onChange={(event) =>
                  setStoryDraft((prev) => ({ ...prev, visibility: normalizeStoryVisibility(event.target.value) }))
                }
                className="w-full rounded-2xl border border-gray-200 px-4 py-2 text-sm text-gray-600"
              >
                {storyVisibilityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStoryTextOpen(false)}
                className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={publishStoryText}
                disabled={storyPosting || !storyDraft.content.trim()}
                className="rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
              >
                {storyPosting ? 'Sharing...' : 'Share story'}
              </button>
            </div>
          </div>
        </div>
      )}

      {storyEditOpen && editingStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Edit story</h3>
              <button
                onClick={() => {
                  setStoryEditOpen(false);
                  setEditingStory(null);
                }}
                className="text-gray-500 hover:text-gray-700"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="overflow-hidden rounded-2xl border border-gray-200">
                {editingStory.type === 'text' ? (
                  <div
                    className="flex h-48 w-full items-center justify-center px-5 text-center"
                    style={{
                      background: storyEditPreviewStyle.background,
                      color: storyEditPreviewStyle.color,
                      fontFamily: storyEditPreviewStyle.fontFamily,
                      textAlign: storyEditPreviewStyle.textAlign as any
                    }}
                  >
                    <p className="text-lg font-semibold leading-snug whitespace-pre-wrap">
                      {storyEditDraft.content.trim() ? storyEditDraft.content : 'Type a status'}
                    </p>
                  </div>
                ) : (
                  (() => {
                    const media = resolveStoryMedia(editingStory);
                    if (media.src) {
                      return media.kind === 'video' ? (
                        <InlineAutoplayVideo
                          key={String(editingStory?.id || media.src)}
                          src={media.src}
                          poster={media.poster}
                          className="h-48 w-full object-cover"
                          containerClassName="h-48 w-full"
                          controls
                          loop
                          preload="metadata"
                          autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY}
                          showMuteToggle={false}
                        />
                      ) : (
                        <OptimizedImage
                          src={media.src}
                          alt="Story media"
                          width={720}
                          height={1280}
                          sizes="(max-width: 768px) 100vw, 420px"
                          className="h-48 w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      );
                    }
                    return (
                      <div className="flex h-48 w-full items-center justify-center text-sm text-gray-500">No media</div>
                    );
                  })()
                )}
              </div>

              <textarea
                value={storyEditDraft.content}
                onChange={(event) => setStoryEditDraft((prev) => ({ ...prev, content: event.target.value }))}
                placeholder={editingStory.type === 'text' ? 'Update your story...' : 'Add a caption (optional)'}
                className="min-h-[140px] w-full rounded-2xl border border-gray-200 p-3 text-sm text-gray-700"
              />

              {editingStory.type === 'text' && (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Background</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {storyTextThemes.map((theme) => (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() =>
                            setStoryEditDraft((prev) => ({
                              ...prev,
                              textBackground: theme.background,
                              textColor: theme.textColor
                            }))
                          }
                          className={`h-8 w-8 rounded-full border ${
                            storyEditDraft.textBackground === theme.background ? 'border-gray-900 ring-2 ring-gray-300' : 'border-white/70'
                          } shadow-sm`}
                          style={{ background: theme.background }}
                          title={theme.label}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Font</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {storyTextFonts.map((font) => (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => setStoryEditDraft((prev) => ({ ...prev, textFont: font.fontFamily }))}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            storyEditDraft.textFont === font.fontFamily ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600'
                          }`}
                          style={{ fontFamily: font.fontFamily }}
                        >
                          {font.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <select
                value={storyEditDraft.visibility}
                onChange={(event) =>
                  setStoryEditDraft((prev) => ({ ...prev, visibility: normalizeStoryVisibility(event.target.value) }))
                }
                className="w-full rounded-2xl border border-gray-200 px-4 py-2 text-sm text-gray-600"
              >
                {storyVisibilityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setStoryEditOpen(false);
                  setEditingStory(null);
                }}
                className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveStoryEdit}
                disabled={storyEditSaving || (!storyEditDraft.content.trim() && editingStory.type === 'text')}
                className="rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
              >
                {storyEditSaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {storyCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Story camera</h3>
              <button onClick={stopStoryCamera} className="text-sm text-gray-500 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl bg-gray-900">
              <video ref={storyVideoRef} autoPlay playsInline className="h-72 w-full object-cover" />
            </div>
            <canvas ref={storyCanvasRef} className="hidden" />
            <div className="mt-4 flex items-center justify-between">
              <button onClick={stopStoryCamera} className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-600">
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button onClick={captureStoryPhoto} className="rounded-xl bg-gray-900 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white">
                  Capture Photo
                </button>
                {storyRecording ? (
                  <button onClick={stopStoryRecording} className="rounded-xl bg-red-600 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white">
                    Stop Recording
                  </button>
                ) : (
                  <button onClick={startStoryRecording} className="rounded-xl border border-gray-300 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700">
                    Record Video
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeStory && (
        <EnterpriseStoryViewer
          story={activeStory}
          stories={stories}
          viewer={user}
          onClose={() => setActiveStory(null)}
          onNavigate={(nextStory) => {
            if (!nextStory?.id) return;
            openStory(nextStory);
          }}
          onEdit={() => openStoryEditor(activeStory)}
          onDelete={() => void handleStoryDelete(activeStory)}
          canManage={canManageStory(activeStory)}
          autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY}
        />
      )}

      <PostExpandModal
        open={Boolean(expandedPost)}
        post={expandedPost}
        viewerId={user?.id}
        viewerUsername={user?.username}
        onClose={() => setExpandedPost(null)}
      />

      <MediaPreviewModal
        open={Boolean(previewMedia)}
        media={previewMedia}
        onClose={() => setPreviewMedia(null)}
      />
    </div>
  );
};

export default CommunityHome;




