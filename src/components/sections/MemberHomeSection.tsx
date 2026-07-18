import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  BriefcaseIcon as Briefcase,
  CameraIcon as Camera,
  CompassIcon as Compass,
  Edit3Icon as Edit3,
  FileTextIcon as FileText,
  ImageIcon,
  MapPinIcon as MapPin,
  MessageCircleIcon as MessageCircle,
  MoreHorizontalIcon as MoreHorizontal,
  PinIcon as Pin,
  PlusIcon as Plus,
  SearchIcon as Search,
  SparklesIcon as Sparkles,
  StarIcon as Star,
  Trash2Icon as Trash2,
  UsersIcon as Users,
  VideoIcon as Video,
  XIcon as X
} from '../icons/ShellIcons';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Coins, Download, Repeat2, Send as SendIcon, ShoppingBag } from 'lucide-react';
import { useLiveFeature } from '../../context/LiveFeatureContext';
import { useUser } from '../../context/UserContext';
import { useContent } from '../../context/ContentContext';
import { useSocket } from '../../context/SocketContext';
import { useNotification } from '../../context/NotificationContext';
import { CommunityService, type BroadcastChannelSummary } from '../../services/community';
import { fetchPublicCommunityPostsBaseline } from '../../services/communityFeedFallback';
import { PipelineService } from '../../services/pipeline';
import { ScrollService, type ScrollConfig, type ScrollSeriesDiscovery, type ScrollVideo } from '../../services/scroll';
import { ReactionsService } from '../../services/reactions';
import { FileService } from '../../services/files';
import { UserService } from '../../services/user';
import { AIService, type PostEnhanceMode } from '../../services/ai/ai.service';
import { jobsApi, Job } from '../../services/jobs';
import { gigsApi, Gig } from '../../services/gigs';
import { RecoService } from '../../services/reco';
import { MessagingService } from '../../services/messaging';
import { SearchService } from '../../services/search';
import { listMarketplaceListings } from '../../services/marketplace';
import type { MarketplaceListing } from '../../types/marketplace';
import { CMSService } from '../../services/cms';
import ProBadge from '../ProBadge';
import ExpandablePreviewText from '../common/ExpandablePreviewText';
import StaticPreviewText from '../common/StaticPreviewText';
import OfferTagSelector from '../commerce/OfferTagSelector';
import ContentOfferTags from '../commerce/ContentOfferTags';
import VerifiedBadge from '../common/VerifiedBadge';
import PostHeader from '../../community/components/PostHeader';
import PostOptionsButton from '../../community/components/post-options/PostOptionsButton';
import PostEngagementBar from '../../community/components/PostEngagementBar';
import ReactionBar from '../../community/components/ReactionBar';
import MentionText from '../../community/components/MentionText';
import MentionHashtagTextarea from '../../community/components/MentionHashtagTextarea';
import FollowButton from '../../community/components/FollowButton';
import { applyFollowUpdatePayload, resetFollowState, setFollowStatuses, useFollowStateMap } from '../../community/followState';
import { getDefaultStoryTextDraft, getStoryTextStyle, storyTextFonts, storyTextThemes } from '../../community/storyStyles';
import { resolveAssetUrl } from '../../utils/assetUrl';
import {
  extractFeedItemList,
  extractHasMore,
  extractNextCursor,
  mergeUniqueFeedItems,
  shouldContinueOffsetFallback
} from '../../utils/feedPagination';
import { resolveFeedTerminalState, shouldHaltEmptyPageLoop } from '../../utils/continuousFeed';
import {
  getStableFeedReactKey,
  isStaleFeedResponse,
  logFeedLifecycle,
  prependRealtimeItem,
  resolveRenderedCountAfterCommit,
  resolveTransportAfterFailure,
  shouldAllowObserverLoadMore,
  shouldShowInitialSkeleton,
  shouldSkipDuplicateCursorRequest,
  shouldStopUnchangedCursorLoop
} from '../../utils/feedLifecycle';
import { Phase2Service } from '../../services/phase2';
import { MemberFeedService } from '../../services/memberFeed';
import { INLINE_VIDEO_PREVIEW_AUTOPLAY, resolveInlineMedia } from '../../utils/inlineMedia';
import { resolvePostAttachmentMediaUrl, resolvePostAttachmentPosterUrl } from '../../utils/postAttachmentMedia';
import { resolveUserAvatarUrl } from '../../utils/userAvatar';
import { hydrateStoryAuthorAvatars } from '../../utils/storyAuthorAvatarHydration';
import {
  postAiInsightPreferenceToBoolean,
  resolvePostAiInsightPreference,
  resolveStoredPostAiInsightPreference,
  type PostAiInsightPreference
} from '../../utils/postAiControls';
import { resolveVerificationLevel } from '../../utils/verification';
import type { PreviewMedia } from '../media/MediaPreviewModal';
import { downloadToDevice } from '../../utils/deviceDownload';
import GraphicWarningGate from '../media/GraphicWarningGate';
import InlineAutoplayVideo from '../media/InlineAutoplayVideo';
import OptimizedImage from '../media/OptimizedImage';
import AdVideoPlayer from '../ads/AdVideoPlayer';
import OverlayActionRailButton from '../media/OverlayActionRailButton';
import PostOriginPreview from '../post/PostOriginPreview';
import TranslatablePostText from '../translation/TranslatablePostText';
import type { MemberHomeHighlightItem, MemberHomeHighlightPill } from '../member-home/MemberHomeHighlightsBoard';
import StoryUploadStatusCard from '../stories/StoryUploadStatusCard';
import StoryAuthorAvatar from '../stories/StoryAuthorAvatar';
import { usePerformanceProfile } from '../../hooks/usePerformanceProfile';
import { Capacitor } from '@capacitor/core';
import {
  buildPostVideoScrollViewerPath,
  stashPendingPostVideoScrollViewerSource,
  type PendingPostVideoScrollViewerSource
} from '../../utils/postVideoScrollBridge';
import { DEFAULT_MEMBER_HOME_REGIONS, DEFAULT_MEMBER_HOME_TOPICS } from '../../constants/defaultAudienceOptions';
import { normalizeContentOfferTags, type OfferTagSelection } from '../../utils/contentOffers';
import { buildPublicAppUrl } from '../../utils/siteUrl';
import { getHighlightedCommunityEvents, type HighlightCommunityEvent } from '../../utils/communityEventHighlights';
import type { CommunityClub, StructuredLocationFields } from '../../types';
import { pickInterestSurveyCandidateId } from '../recommendation/ContentInterestSurvey';
import FeedIntelligenceSignals, { RecoSignalChips } from '../feed/FeedIntelligenceSignals';
import {
  resolveFeedRankingPresentation,
  resolveListingFitReasons,
  resolvePageRecoPresentation,
  resolvePersonRecoPresentation
} from '../../utils/feedIntelligence';
import { buildScrolithaPath } from '../../utils/scrolithaLaunch';
import { writePendingProjectPrompt } from '../../utils/scrolithaDrafts';
import EnterpriseStoryViewer from '../../features/stories/components/StoryViewer';
import {
  enterpriseCta,
  enterpriseCtaPrimary,
  enterpriseFeedColumn,
  enterpriseLeftColumn,
  enterpriseMemberHomeGrid,
  enterprisePageShell,
  enterprisePanel,
  enterprisePanelPadding,
  enterprisePostCard,
  enterprisePostCardCompact,
  enterprisePostCardPadding,
  enterpriseRightColumn,
  enterpriseSponsoredLabel,
  enterpriseWidgetHeading,
  enterpriseWidgetTitle
} from '../enterprise/enterpriseClasses';
import {
  composerAttachmentTile,
  composerDraftBanner,
  composerEditor,
  composerEntryCard,
  composerEntryShortcut,
  composerEntryTrigger,
  composerField,
  composerPrimaryBtn,
  composerSecondaryBtn,
  composerToolbarBtn
} from '../composer/composerClasses';
import {
  buildComposerDraftKey,
  clearComposerDraft,
  isComposerDraftMeaningful,
  loadComposerDraft,
  saveComposerDraft
} from '../composer/composerDraftStore';
import {
  canPublishWithAttachments,
  revokePreviewUrl,
  validateComposerFile
} from '../composer/composerAttachments';
import { createPublishGuard } from '../composer/composerPublishGuard';
import ComposerShell from '../composer/ComposerShell';

const LocationPicker = React.lazy(() => import('../common/LocationPicker'));
const RepostModal = React.lazy(() => import('../../community/components/RepostModal'));
const PostShareModal = React.lazy(() => import('../../community/components/PostShareModal'));
const ScrollCreateModal = React.lazy(() => import('../../features/scroll/ScrollCreateModal'));
const LiveFeaturedRail = React.lazy(() => import('../../features/live/components/LiveFeaturedRail'));
const SendGcoinModal = React.lazy(() => import('../SendGcoinModal'));
const MediaPreviewModal = React.lazy(() => import('../media/MediaPreviewModal'));
const PostExpandModal = React.lazy(() => import('../post/PostExpandModal'));
const InsightsQuickPanel = React.lazy(() => import('../insights/InsightsQuickPanel'));
const MemberHomeHighlightsBoard = React.lazy(() => import('../member-home/MemberHomeHighlightsBoard'));
const StoryReplySheet = React.lazy(() => import('../stories/StoryReplySheet'));

const STORY_CONTROL_HIDE_DELAY_MS = 20000;
const STORY_AUTO_ADVANCE_MS = 5500;
const STORY_VIDEO_FALLBACK_ADVANCE_MS = 9000;
const STORY_AUTO_ADVANCE_MAX_MS = 30000;

type MemberHomeContent = {
  title?: string;
  subtitle?: string;
  searchPlaceholder?: string;
  searchHint?: string;
  showSearch?: boolean;
  showDiscover?: boolean;
  showFollowing?: boolean;
  showComposer?: boolean;
  showStories?: boolean;
  showMessages?: boolean;
  showSlider?: boolean;
  showProfiles?: boolean;
  showPagesRecommendations?: boolean;
  showProfileViewers?: boolean;
  showProfileViewing?: boolean;
  showJobs?: boolean;
  showEmployers?: boolean;
  showGigs?: boolean;
  showFreelancers?: boolean;
  maxFeedItems?: number;
  maxStories?: number;
  maxMessages?: number;
  maxSearchResults?: number;
  maxProfiles?: number;
  maxPagesRecommendations?: number;
  maxProfileViewers?: number;
  maxProfileViewing?: number;
  maxJobs?: number;
  maxGigs?: number;
  topics?: string[];
  regions?: string[];
  storyTitle?: string;
  reelsTitle?: string;
  composerTitle?: string;
  feedTitle?: string;
  profilesTitle?: string;
  pagesTitle?: string;
  profileViewersTitle?: string;
  profileViewingTitle?: string;
  jobsTitle?: string;
  gigsTitle?: string;
  employersTitle?: string;
  freelancersTitle?: string;
  messagesTitle?: string;
  sliderTitle?: string;
  featuredActionsTitle?: string;
  projectBriefQuickActionTitle?: string;
  projectBriefQuickActionSubtitle?: string;
  gigCreationQuickActionTitle?: string;
  gigCreationQuickActionSubtitle?: string;
  sliderItems?: {
    id?: string;
    title?: string;
    subtitle?: string;
    imageUrl?: string;
    videoUrl?: string;
    ctaLabel?: string;
    ctaUrl?: string;
  }[];
};

type FeedPost = {
  id: string;
  title?: string;
  content?: string;
  attachmentFileIds?: string[];
  attachments?: {
    id?: string;
    url: string;
    name?: string;
    type?: string;
    mimeType?: string;
    thumbnailUrl?: string | null;
    duration?: number | null;
    width?: number | null;
    height?: number | null;
  }[];
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
  authorId?: string;
  authorUserId?: string;
  authorName?: string;
  authorUsername?: string;
  authorAvatar?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  mentions?: string[];
  topic?: string | null;
  topicSummary?: string[];
  location?: string | null;
  visibility?: string;
  commentPolicy?: string | null;
  repostsEnabled?: boolean;
  offerTags?: any[];
  originalPost?: {
    id?: string;
    authorName?: string | null;
    authorUsername?: string | null;
    title?: string | null;
    content?: string | null;
  } | null;
  isPinned?: boolean;
  isHighlighted?: boolean;
  graphicWarning?: boolean;
  isAIEnhanced?: boolean;
  dashGcoinTotal?: number;
  aiInsightEnabled?: boolean;
  aiInsightGenerated?: boolean;
  aiInsightText?: string | null;
  aiScore?: number | null;
  ranking?: {
    mode?: string;
    score?: number;
    primaryReason?: string;
    reasons?: string[];
  };
  pipelineState?: {
    saved?: boolean;
  };
  interactions?: {
    likes?: number;
    comments?: number;
    shares?: number;
    reposts?: number;
    views?: number;
    reactions?: Record<string, number> | number;
    dashGcoinTotal?: number;
  };
  userState?: { liked?: boolean; reposted?: boolean };
};

type ProfileCard = {
  id: string;
  name: string;
  subtitle?: string;
  avatar?: string | null;
  username?: string;
  entityType?: 'freelancer' | 'client';
  viewedAt?: string;
  /** Phase 18 — presentation-only reco explainability from existing fields. */
  reasons?: string[];
  whyRecommended?: string;
  badge?: string;
};

type RecommendedPageCard = {
  id: string;
  name: string;
  slug?: string;
  handle?: string;
  tagline?: string;
  industry?: string;
  avatar?: string | null;
  followersCount?: number;
  isFollowing?: boolean;
  followId?: string | null;
  reasons?: string[];
  whyRecommended?: string;
};

type SidebarAdCard = {
  id: string;
  title: string;
  body?: string;
  ctaText?: string;
  destinationUrl?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  placement?: string;
};

type PostMediaItem = {
  localId: string;
  id?: string;
  url: string;
  name?: string;
  type?: 'image' | 'video' | 'document';
  mimeType?: string;
  thumbnailUrl?: string | null;
  duration?: number | null;
  progress?: number;
  uploading?: boolean;
  error?: string;
};

type PostDraft = {
  title: string;
  content: string;
  tags: string;
  mentions: string;
  topic: string;
  region: string;
  location: string;
  visibility: 'public' | 'friends' | 'network' | 'private' | 'custom';
  commentPolicy: 'everyone' | 'followers' | 'following' | 'mutuals' | 'none';
  graphicWarning: boolean;
  isAIEnhanced: boolean;
  aiInsightPreference: PostAiInsightPreference;
  offerTags: OfferTagSelection[];
  media: PostMediaItem[];
};

type DesktopComposerIntent = 'text' | 'photo' | 'video' | 'article';

type PostAuthorOption = {
  id: string;
  type: 'user' | 'page';
  label: string;
  subtitle: string;
  avatarUrl?: string | null;
  pageId?: string | null;
  slug?: string | null;
};

type StoryVisibility = 'public' | 'followers' | 'following' | 'mutuals' | 'network' | 'private' | 'custom';

type StoryDraft = {
  content: string;
  visibility: StoryVisibility;
  textBackground: string;
  textColor: string;
  textFont: string;
  textAlign: 'center' | 'left' | 'right';
};

type StoryKind = 'text' | 'image' | 'video';

type SearchResultItem = {
  id?: string;
  type?: string;
  title?: string;
  name?: string;
  username?: string;
  subtitle?: string;
  description?: string;
  excerpt?: string;
  url?: string;
  avatarUrl?: string | null;
  image?: string;
  category?: string;
  meta?: Record<string, any>;
};

type SearchGroupKey = 'people' | 'pages' | 'jobs' | 'gigs' | 'marketplace' | 'posts';
type SearchGroupMap = Record<SearchGroupKey, SearchResultItem[]>;

const SEARCH_GROUP_ORDER: SearchGroupKey[] = ['people', 'pages', 'jobs', 'gigs', 'marketplace', 'posts'];
const SEARCH_GROUP_LABELS: Record<SearchGroupKey, string> = {
  people: 'Users',
  pages: 'Pages',
  jobs: 'Jobs',
  gigs: 'Gigs',
  marketplace: 'Marketplace',
  posts: 'Posts'
};

const SEARCH_GROUP_BADGES: Record<SearchGroupKey, string> = {
  people: 'User',
  pages: 'Page',
  jobs: 'Job',
  gigs: 'Gig',
  marketplace: 'Item',
  posts: 'Post'
};

const emptySearchGroups = (): SearchGroupMap => ({
  people: [],
  pages: [],
  jobs: [],
  gigs: [],
  marketplace: [],
  posts: []
});

const MEMBER_HOME_SEARCH_PROMPTS = [
  'interview tips',
  'remote work',
  'Scrolith',
  'latest in ai',
  'logo design',
  'project manager'
];

const createEmptyPostDraft = (): PostDraft => ({
  title: '',
  content: '',
  tags: '',
  mentions: '',
  topic: '',
  region: '',
  location: '',
  visibility: 'public',
  commentPolicy: 'everyone',
  graphicWarning: false,
  isAIEnhanced: false,
  aiInsightPreference: 'auto',
  offerTags: [],
  media: []
});

const stripHtmlToText = (value: string): string =>
  String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

const normalizeCompareText = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const composePostLocationValue = (location: string, region: string): string => {
  const nextLocation = String(location || '').trim();
  const nextRegion = String(region || '').trim();
  if (!nextLocation) return nextRegion;
  if (!nextRegion) return nextLocation;
  const normalizedLocation = normalizeCompareText(nextLocation);
  const normalizedRegion = normalizeCompareText(nextRegion);
  if (!normalizedLocation || !normalizedRegion) return nextLocation || nextRegion;
  if (normalizedLocation.includes(normalizedRegion) || normalizedRegion.includes(normalizedLocation)) {
    return nextLocation;
  }
  return `${nextLocation}, ${nextRegion}`;
};

const readRenderableText = (value: unknown, seen?: WeakSet<object>): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return '';
    if (
      (raw.startsWith('{') && raw.endsWith('}')) ||
      (raw.startsWith('[') && raw.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(raw);
        const parsedText = readRenderableText(parsed, seen);
        if (parsedText) return parsedText;
      } catch {
        // Fall through to the raw string.
      }
    }
    const htmlText = stripHtmlToText(raw);
    return htmlText || raw;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((entry) => readRenderableText(entry, seen))
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  if (value && typeof value === 'object') {
    const nextSeen = seen || new WeakSet<object>();
    if (nextSeen.has(value as object)) return '';
    nextSeen.add(value as object);
    const record = value as Record<string, unknown>;
    const preferredKeys = [
      'text',
      'content',
      'body',
      'description',
      'title',
      'headline',
      'subject',
      'caption',
      'summary',
      'excerpt',
      'message',
      'plainText',
      'plain_text',
      'formattedText',
      'formatted_text',
      'html',
      'htmlContent',
      'html_content',
      'label',
      'value',
      'insert'
    ];
    for (const key of preferredKeys) {
      if (!(key in record)) continue;
      const nestedText = readRenderableText(record[key], nextSeen);
      if (nestedText) return nestedText;
    }
    const blockText = readRenderableText(record.blocks, nextSeen);
    if (blockText) return blockText;
    const deltaText = readRenderableText(record.ops, nextSeen);
    if (deltaText) return deltaText;
    return Object.values(record)
      .map((entry) => readRenderableText(entry, nextSeen))
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  return '';
};

const getStructuredLocationLabel = (value?: Partial<StructuredLocationFields> | null): string =>
  readRenderableText(value?.formattedAddress || value?.formatted_address || value?.location);

const normalizeOwnedBusinessPage = (page: any): PostAuthorOption | null => {
  const pageId = readRenderableText(page?.id || page?._id);
  const label = readRenderableText(page?.name || page?.title || page?.pageName);
  if (!pageId || !label) return null;
  const subtitle =
    readRenderableText(page?.tagline || page?.headline || page?.industry || page?.category) || 'Post as page';
  const avatarUrl = resolveUserAvatarUrl(page) || null;
  const slug = readRenderableText(page?.slug || page?.handle) || null;
  return {
    id: `page:${pageId}`,
    type: 'page',
    label,
    subtitle,
    avatarUrl,
    pageId,
    slug
  };
};

type FeedTab = 'latest' | 'following' | 'trending' | 'for_you' | 'hire' | 'sell' | 'learn' | 'local';

const INTENT_FEED_TABS: FeedTab[] = ['for_you', 'hire', 'sell', 'learn', 'local'];

const normalizeFeedTabValue = (value: unknown): FeedTab | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'latest' ||
    normalized === 'following' ||
    normalized === 'trending' ||
    normalized === 'for_you' ||
    normalized === 'hire' ||
    normalized === 'sell' ||
    normalized === 'learn' ||
    normalized === 'local'
  ) {
    return normalized as FeedTab;
  }
  return null;
};

const isIntentFeedTab = (value: FeedTab) => INTENT_FEED_TABS.includes(value);

const resolveToggle = (contentValue: boolean | undefined, settingsValue: unknown, fallback = true) => {
  if (typeof contentValue === 'boolean') return contentValue;
  if (typeof settingsValue === 'boolean') return settingsValue;
  return fallback;
};

const normalizeMemberHomeRoles = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
};

const isMemberHomeSectionVisibleToRole = (section: any, role: string | undefined) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const roles = normalizeMemberHomeRoles(
    section?.targeting?.roles ?? section?.target_roles ?? section?.roles ?? section?.visibility
  );
  if (!normalizedRole || roles.length === 0) return true;
  return roles.includes(normalizedRole) || roles.includes('all') || roles.includes('*');
};

const defaultTopics = DEFAULT_MEMBER_HOME_TOPICS;

const defaultRegions = DEFAULT_MEMBER_HOME_REGIONS;

const commentPolicyOptions = [
  { value: 'everyone', label: 'Everyone can comment' },
  { value: 'followers', label: 'Followers can comment' },
  { value: 'following', label: 'People you follow can comment' },
  { value: 'mutuals', label: 'Mutual followers can comment' },
  { value: 'none', label: 'Disable comments' }
];

const postAiActions: Array<{ mode: PostEnhanceMode; label: string }> = [
  { mode: 'grammar', label: 'Improve Grammar' },
  { mode: 'rephrase', label: 'Rephrase' },
  { mode: 'professional', label: 'Make Professional' },
  { mode: 'shorten', label: 'Shorten' },
  { mode: 'expand', label: 'Expand' }
];

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
const resolveStoryAutoAdvanceDelay = (story: any) => {
  if (resolveStoryType(story) !== 'video') return STORY_AUTO_ADVANCE_MS;
  const durationSeconds = Number(story?.media?.duration ?? story?.duration ?? story?.mediaDuration ?? 0);
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return Math.max(4000, Math.min(STORY_AUTO_ADVANCE_MAX_MS, Math.round(durationSeconds * 1000 + 350)));
  }
  return STORY_VIDEO_FALLBACK_ADVANCE_MS;
};

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

const resolveReelMedia = (scroll: ScrollVideo) => {
  const media = scroll?.media || scroll;
  const inline = resolveInlineMedia(media, { typeHint: 'video' });
  if (inline.src) return inline;
  // Fall back through attachment resolver for nested file/asset payloads.
  const src = resolvePostAttachmentMediaUrl(media);
  const poster = resolvePostAttachmentPosterUrl(media);
  return {
    kind: (src ? 'video' : 'unknown') as 'video' | 'image' | 'document' | 'unknown',
    src: src || '',
    poster: poster || undefined
  };
};

const resolveReelAuthorName = (scroll: ScrollVideo, fallback = 'Scrolith') => {
  const normalized = String(scroll?.author?.name || '').trim();
  return normalized || fallback;
};

const resolveReelAuthorAvatar = (scroll: ScrollVideo) => {
  return (
    resolveUserAvatarUrl(scroll?.author) ||
    resolvePostAttachmentMediaUrl(scroll?.author?.avatar) ||
    resolveAssetUrl(String(scroll?.author?.avatar || '').trim()) ||
    ''
  );
};

const resolveReelAuthorInitial = (scroll: ScrollVideo) => {
  const first = resolveReelAuthorName(scroll, 'S').replace(/^@+/, '').trim().charAt(0).toUpperCase();
  return first || 'S';
};

const dedupeLabels = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.trim().toLowerCase();
    if (!normalized) return false;
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

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

const formatCompactMetric = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0';
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1).replace(/\.0$/, '')}M+`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1).replace(/\.0$/, '')}k+`;
  return String(Math.trunc(numeric));
};

const isPrivilegedRole = (role?: string) => {
  const normalized = String(role || '').toLowerCase();
  return normalized.includes('admin') || normalized === 'moderator';
};

const isUnauthorizedError = (error: any) => Number(error?.response?.status) === 401;

const getApiErrorMessage = (error: any, fallback: string) => {
  const apiMessage = error?.response?.data?.message;
  if (typeof apiMessage === 'string' && apiMessage.trim()) return apiMessage.trim();
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  if (!message || message.startsWith('Request failed with status code')) return fallback;
  return message;
};

const inferMediaType = (media: {
  url?: string;
  mimeType?: string;
  mime_type?: string;
  type?: string;
  kind?: string;
  mediaType?: string;
  media_type?: string;
  contentType?: string;
  content_type?: string;
  videoUrl?: string;
  video_url?: string;
}) => {
  const explicit = String(
    media.type ||
      media.kind ||
      media.mediaType ||
      media.media_type ||
      media.contentType ||
      media.content_type ||
      ''
  ).toLowerCase();
  if (explicit === 'image' || explicit === 'video' || explicit === 'document') return explicit;
  const mime = String(media.mimeType || media.mime_type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  const url = String(media.url || media.videoUrl || media.video_url || '').toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogg|avi|mkv)(\?|$)/.test(url) || url.includes('/video/')) return 'video';
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(url)) return 'image';
  return 'document';
};

const formatMediaDuration = (duration?: number | null) => {
  if (!duration || Number.isNaN(duration)) return '';
  const totalSeconds = Math.max(0, Math.round(Number(duration)));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const GRAPHIC_WARNING_LABEL = 'Graphic warning';
const FEED_SINGLE_MEDIA_HEIGHT_CLASS = 'h-[24rem] sm:h-[30rem] lg:h-[36rem]';
const FEED_MULTI_MEDIA_HEIGHT_CLASS = 'h-[18rem] sm:h-[22rem] lg:h-[26rem]';
const BRAND_LOGO_URL = '/logo.png';

const buildPostScrolithaPrompt = (title: string, content: string) => {
  const safeTitle = String(title || '').trim();
  const safeContent = String(content || '').replace(/\s+/g, ' ').trim();
  const excerpt = safeContent.slice(0, 280);
  if (safeTitle && excerpt) {
    return `Improve this Scrolith post for clarity, reach, and conversion.\nTitle: ${safeTitle}\nBody: ${excerpt}`;
  }
  if (safeTitle) {
    return `Improve this Scrolith post title and suggest a stronger body copy:\n${safeTitle}`;
  }
  if (excerpt) {
    return `Improve this Scrolith post and suggest better engagement hooks:\n${excerpt}`;
  }
  return 'Help me draft a high-performing Scrolith post for global professional audience.';
};

const buildListingScrolithaPrompt = (kind: 'job' | 'gig', title: string, category: string) => {
  const safeTitle = String(title || '').trim() || (kind === 'job' ? 'Job opportunity' : 'Service offer');
  const safeCategory = String(category || '').trim() || (kind === 'job' ? 'Hiring' : 'Services');
  if (kind === 'job') {
    return `Improve this job card copy for better applicant quality.\nTitle: ${safeTitle}\nCategory: ${safeCategory}\nReturn concise, enterprise-grade wording.`;
  }
  return `Improve this gig card copy for better conversion and trust.\nTitle: ${safeTitle}\nCategory: ${safeCategory}\nReturn concise, enterprise-grade wording.`;
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

const shuffleArray = <T,>(items: T[]) => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const dedupeById = <T extends { id?: string | null }>(items: T[]) => {
  const seen = new Set<string>();
  const out: T[] = [];
  items.forEach((item) => {
    const id = String(item?.id || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(item);
  });
  return out;
};

const withFeedFallbackTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
  let timer: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = window.setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== null) window.clearTimeout(timer);
  }
};

const formatListingAmount = (value: any, fallback = 'Flexible') => {
  const raw =
    typeof value === 'number'
      ? value
      : value?.amount ?? value?.minAmount ?? value?.maxAmount ?? null;
  if (raw === null || raw === undefined || Number.isNaN(Number(raw))) return fallback;
  try {
    return `$${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(raw))}`;
  } catch {
    return `$${Number(raw)}`;
  }
};

const isClientVerified = (job: any) =>
  Boolean(job?.clientIsVerified ?? job?.client_is_verified ?? job?.clientVerified);

const isFreelancerVerified = (gig: any) =>
  Boolean(gig?.freelancerIsVerified ?? gig?.freelancer_is_verified ?? gig?.freelancerVerified);

const getClientVerificationLevel = (job: any) =>
  resolveVerificationLevel({
    verificationLevel:
      job?.clientVerificationLevel ||
      job?.client_verification_level ||
      job?.clientBadgeType ||
      job?.client_badge_type,
    isVerified: isClientVerified(job),
    isPro: job?.clientIsPro,
    type: job?.clientType || 'business'
  });

const getFreelancerVerificationLevel = (gig: any) =>
  resolveVerificationLevel({
    verificationLevel:
      gig?.freelancerVerificationLevel ||
      gig?.freelancer_verification_level ||
      gig?.freelancerBadgeType ||
      gig?.freelancer_badge_type,
    isVerified: isFreelancerVerified(gig),
    isPro: gig?.freelancerIsPro,
    type: gig?.freelancerType || 'user'
  });

const firstNonEmptyString = (values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const firstStringFromArray = (value: unknown): string => {
  if (!Array.isArray(value)) return '';
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  return '';
};

const firstUrlFromObjectArray = (value: unknown): string => {
  if (!Array.isArray(value)) return '';
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const url = firstNonEmptyString([
      (item as any).url,
      (item as any).thumbnailUrl,
      (item as any).thumbnail_url,
      (item as any).previewUrl,
      (item as any).preview_url
    ]);
    if (url) return url;
  }
  return '';
};

const resolveListingImageUrl = (listing: any): string => {
  const raw = firstNonEmptyString([
    listing?.image,
    listing?.coverImage,
    listing?.cover_image,
    listing?.cover,
    listing?.thumbnailUrl,
    listing?.thumbnail_url,
    listing?.previewImage,
    listing?.preview_image,
    firstStringFromArray(listing?.images),
    firstStringFromArray(listing?.media),
    firstStringFromArray(listing?.attachments),
    firstUrlFromObjectArray(listing?.mediaObjects),
    firstUrlFromObjectArray(listing?.media_objects),
    firstUrlFromObjectArray(listing?.mediaFiles),
    firstUrlFromObjectArray(listing?.media_files),
    listing?.clientAvatar,
    listing?.freelancerAvatar
  ]);
  return raw ? resolveAssetUrl(raw) : '';
};

const resolveHighlightPostMedia = (post: any): string => {
  const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
  for (const attachment of attachments) {
    if (!attachment) continue;
    const posterUrl = String(resolvePostAttachmentPosterUrl(attachment) || '').trim();
    if (posterUrl) return posterUrl;
    if (inferMediaType(attachment) === 'video') {
      const mediaUrl = String(resolvePostAttachmentMediaUrl(attachment) || '').trim();
      if (mediaUrl) return mediaUrl;
    }
    const mime = String(attachment?.mimeType || attachment?.mime_type || '').trim().toLowerCase();
    const type = String(attachment?.type || '').trim().toLowerCase();
    if (mime.startsWith('image/') || type === 'image') {
      const mediaUrl = String(resolvePostAttachmentMediaUrl(attachment) || '').trim();
      if (mediaUrl) return mediaUrl;
    }
  }
  return '';
};

const resolveHighlightPostVideo = (post: any): string => {
  const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
  for (const attachment of attachments) {
    if (!attachment) continue;
    if (inferMediaType(attachment) !== 'video') continue;
    const mediaUrl = String(resolvePostAttachmentMediaUrl(attachment) || '').trim();
    if (mediaUrl) return mediaUrl;
  }
  return '';
};

const resolveHighlightPostPoster = (post: any): string => {
  const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
  for (const attachment of attachments) {
    if (!attachment) continue;
    const posterUrl = String(resolvePostAttachmentPosterUrl(attachment) || '').trim();
    if (posterUrl) return posterUrl;
  }
  return '';
};

const resolveHighlightPostFallback = (post: any): string => {
  const raw = firstNonEmptyString([
    post?.author?.avatarUrl,
    post?.authorAvatar,
    BRAND_LOGO_URL
  ]);
  return raw ? resolveAssetUrl(raw) : BRAND_LOGO_URL;
};

const resolveSyntheticVideoAttachment = (post: any) => {
  const videoUrl = String(
    post?.videoUrl ||
      post?.video_url ||
      post?.mediaUrl ||
      post?.media_url ||
      post?.sourceVideoUrl ||
      post?.source_video_url ||
      ''
  ).trim();
  if (!videoUrl) return null;
  return {
    id: String(post?.videoAttachmentId || post?.video_attachment_id || videoUrl).trim() || videoUrl,
    url: videoUrl,
    name: String(post?.title || post?.videoTitle || post?.video_title || 'Video post').trim() || 'Video post',
    type: 'video',
    kind: 'video',
    mimeType: 'video/mp4',
    thumbnailUrl:
      String(
        post?.thumbnailUrl ||
          post?.thumbnail_url ||
          post?.posterUrl ||
          post?.poster_url ||
          post?.previewUrl ||
          post?.preview_url ||
          ''
      ).trim() || null
  };
};

const extractJobsFromPayload = (payload: any): Job[] => {
  if (Array.isArray(payload?.data?.jobs)) return payload.data.jobs as Job[];
  if (Array.isArray(payload?.data?.items)) return payload.data.items as Job[];
  if (Array.isArray(payload?.items)) return payload.items as Job[];
  if (Array.isArray(payload?.jobs)) return payload.jobs as Job[];
  if (Array.isArray(payload?.data)) return payload.data as Job[];
  if (Array.isArray(payload)) {
    const looksLikeJobList = payload.every((entry) => !entry || typeof entry !== 'object' || Object.prototype.hasOwnProperty.call(entry, 'id'));
    if (looksLikeJobList) return payload as Job[];
  }
  return [];
};

const extractGigsFromPayload = (payload: any): Gig[] => {
  if (Array.isArray(payload?.data?.gigs)) return payload.data.gigs as Gig[];
  if (Array.isArray(payload?.data?.items)) return payload.data.items as Gig[];
  if (Array.isArray(payload?.items)) return payload.items as Gig[];
  if (Array.isArray(payload?.gigs)) return payload.gigs as Gig[];
  if (Array.isArray(payload?.data)) return payload.data as Gig[];
  if (Array.isArray(payload)) {
    const looksLikeGigList = payload.every((entry) => !entry || typeof entry !== 'object' || Object.prototype.hasOwnProperty.call(entry, 'id'));
    if (looksLikeGigList) return payload as Gig[];
  }
  return [];
};

const isSettledResultArray = (value: any): value is Array<{ status: 'fulfilled' | 'rejected'; value?: any }> =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((entry) => entry && typeof entry === 'object' && typeof entry.status === 'string');

const mergeSettledResponses = <T extends { id?: string | null }>(
  payload: any,
  extractor: (value: any) => T[]
): T[] => {
  if (!isSettledResultArray(payload)) {
    return extractor(payload);
  }
  const merged: T[] = [];
  payload.forEach((entry) => {
    if (entry.status !== 'fulfilled') return;
    merged.push(...extractor(entry.value));
  });
  return merged;
};

const MemberHomeSection: React.FC<{ content?: MemberHomeContent }> = ({ content: contentProp }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const { user } = useUser();
  const { status: liveFeatureStatus } = useLiveFeature();
  const { settings } = useContent();
  const { socket } = useSocket();
  const { showNotification } = useNotification();
  const { profile } = usePerformanceProfile();
  const followStateMap = useFollowStateMap();
  const [managedContent, setManagedContent] = useState<MemberHomeContent | null>(contentProp ?? null);
  const viewTracked = useRef<Set<string>>(new Set());
  const desktopFeedSentinelRef = useRef<HTMLDivElement | null>(null);
  const focusPostId = React.useMemo(() => {
    const routeId = String(params.id || '').trim();
    if (routeId) return routeId;
    const matched = location.pathname.match(/\/community\/posts\/([^/?#]+)/i);
    if (!matched?.[1]) return '';
    try {
      return decodeURIComponent(matched[1]);
    } catch {
      return matched[1];
    }
  }, [location.pathname, params.id]);
  const focusCommentId = React.useMemo(
    () => String(new URLSearchParams(location.search).get('comment') || '').trim(),
    [location.search]
  );
  const focusMentionToken = React.useMemo(
    () => String(new URLSearchParams(location.search).get('mention') || '').trim(),
    [location.search]
  );

  const loadManagedContent = useCallback(async () => {
    if (contentProp) {
      setManagedContent(contentProp);
      return;
    }
    if (!user) {
      setManagedContent(null);
      return;
    }

    try {
      const sections = await CMSService.getHomepageSections({ role: user.role as any });
      const memberHomeSection = sections.find(
        (section: any) =>
          section?.type === 'member_home' &&
          section?.isActive !== false &&
          section?.is_active !== false &&
          isMemberHomeSectionVisibleToRole(section, user.role)
      );
      setManagedContent((memberHomeSection?.content as MemberHomeContent) || null);
    } catch (error) {
      console.error('Failed to load managed member home content', error);
      setManagedContent(null);
    }
  }, [contentProp, user]);

  useEffect(() => {
    void loadManagedContent();
  }, [loadManagedContent]);

  useEffect(() => {
    if (!socket || contentProp) return undefined;

    const handleSectionsUpdated = (sections: any[]) => {
      if (!user) {
        setManagedContent(null);
        return;
      }
      if (Array.isArray(sections) && sections.length > 0) {
        const memberHomeSection = sections.find(
          (section: any) =>
            section?.type === 'member_home' &&
            section?.isActive !== false &&
            section?.is_active !== false &&
            isMemberHomeSectionVisibleToRole(section, user.role)
        );
        setManagedContent((memberHomeSection?.content as MemberHomeContent) || null);
        return;
      }
      void loadManagedContent();
    };

    socket.on('cms:sections_updated', handleSectionsUpdated);
    return () => {
      socket.off('cms:sections_updated', handleSectionsUpdated);
    };
  }, [contentProp, loadManagedContent, socket, user]);

  const content = useMemo(() => contentProp ?? managedContent ?? undefined, [contentProp, managedContent]);

  const [feedTab, setFeedTab] = useState<FeedTab>('latest');
  const [feedTopic, setFeedTopic] = useState('');
  const [feedRegion, setFeedRegion] = useState('');
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedItems, setFeedItems] = useState<FeedPost[]>([]);
  const [feedNextCursor, setFeedNextCursor] = useState<string | null>(null);
  const [feedOffsetFallbackEnabled, setFeedOffsetFallbackEnabled] = useState(false);
  const [feedTerminal, setFeedTerminal] = useState(false);
  const feedEmptyPageStreakRef = useRef(0);
  const feedDiscoveryUsedRef = useRef(false);
  /** Phase 3: prefer enterprise orchestrator; fall back to Phase 1 continuous loaders. */
  const feedTransportRef = useRef<'orchestrated' | 'legacy'>('legacy');
  /** Once orchestrated fails this session, stay on legacy until deliberate hard refresh. */
  const feedOrchestratedFailedRef = useRef(false);
  const feedAbortRef = useRef<AbortController | null>(null);
  const desktopConstrainedFeed = profile.lowBandwidth || profile.dataSaver;
  const desktopInitialRenderCount = desktopConstrainedFeed ? 6 : 8;
  const desktopRenderStep = desktopConstrainedFeed ? 4 : 6;
  const [renderedFeedItemCount, setRenderedFeedItemCount] = useState(desktopInitialRenderCount);
  const renderedFeedItemCountRef = useRef(desktopInitialRenderCount);
  const feedItemsRef = useRef<FeedPost[]>([]);
  const feedLoadRequestIdRef = useRef(0);
  const feedLoadingMoreRef = useRef(false);
  const feedLoadingRef = useRef(false);
  const feedNextCursorRef = useRef<string | null>(null);
  const feedOffsetFallbackRef = useRef(false);
  const feedTerminalRef = useRef(false);
  const feedInFlightCursorRef = useRef<string | null>(null);
  const feedLastCompletedCursorRef = useRef<string | null>(null);
  const feedLastCompletedAddedRef = useRef(0);
  const extractFeedItems = useCallback((value: any) => extractFeedItemList(value), []);
  const extractFeedCursor = useCallback((value: any) => extractNextCursor(value), []);
  const commitFeedItems = useCallback((items: FeedPost[], options?: { forceResetWindow?: boolean }) => {
    const previousLength = feedItemsRef.current.length;
    const previousRendered = renderedFeedItemCountRef.current;
    feedItemsRef.current = items;
    setFeedItems(items);
    const nextRendered = resolveRenderedCountAfterCommit({
      previousRendered,
      previousLength,
      nextLength: items.length,
      initialWindow: desktopInitialRenderCount,
      forceReset: Boolean(options?.forceResetWindow)
    });
    renderedFeedItemCountRef.current = nextRendered;
    setRenderedFeedItemCount(nextRendered);
  }, [desktopInitialRenderCount]);
  const appendFeedItems = useCallback((items: FeedPost[]) => {
    if (!items.length) return { addedCount: 0 };
    const { merged, addedCount } = mergeUniqueFeedItems(feedItemsRef.current, items);
    if (addedCount <= 0) return { addedCount: 0 };
    feedItemsRef.current = merged as FeedPost[];
    setFeedItems(merged as FeedPost[]);
    setRenderedFeedItemCount((prev) => {
      const minimum = Math.min(desktopInitialRenderCount, merged.length || desktopInitialRenderCount);
      const nextCount = Math.max(prev + Math.max(addedCount, desktopRenderStep), minimum);
      const clamped = Math.min(merged.length, nextCount);
      renderedFeedItemCountRef.current = clamped;
      return clamped;
    });
    return { addedCount };
  }, [desktopInitialRenderCount, desktopRenderStep]);
  // Render from committed feed state directly — deferred slicing caused blank gaps during refresh.
  const renderableFeedItems = useMemo(
    () => feedItems.slice(0, Math.min(renderedFeedItemCount, feedItems.length)),
    [feedItems, renderedFeedItemCount]
  );
  const interestSurveyPostId = useMemo(
    () =>
      pickInterestSurveyCandidateId(
        renderableFeedItems.map((post: any) => ({
          id: post?.id,
          authorId: post?.authorUserId || post?.authorId,
          initialSignal: post?.userState?.interestSignal
        })),
        user?.id,
        'post'
      ),
    [renderableFeedItems, user?.id]
  );
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [pipelineBusyByPostId, setPipelineBusyByPostId] = useState<Record<string, boolean>>({});
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<PostDraft | null>(null);
  const [postActionBusy, setPostActionBusy] = useState<Record<string, boolean>>({});
  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [recommendedPages, setRecommendedPages] = useState<RecommendedPageCard[]>([]);
  const [pagesFollowBusy, setPagesFollowBusy] = useState<Record<string, boolean>>({});
  const [profileViewers, setProfileViewers] = useState<ProfileCard[]>([]);
  const [profileViewing, setProfileViewing] = useState<ProfileCard[]>([]);
  const [sidebarTopAd, setSidebarTopAd] = useState<SidebarAdCard | null>(null);
  const [sidebarFeaturedAd, setSidebarFeaturedAd] = useState<SidebarAdCard | null>(null);
  const [sidebarMiddleAd, setSidebarMiddleAd] = useState<SidebarAdCard | null>(null);
  const [marketplacePreviewListings, setMarketplacePreviewListings] = useState<MarketplaceListing[]>([]);
  const [marketplacePreviewLoading, setMarketplacePreviewLoading] = useState(false);
  const [groupPreviewRecommendations, setGroupPreviewRecommendations] = useState<CommunityClub[]>([]);
  const [groupPreviewLoading, setGroupPreviewLoading] = useState(false);
  const [groupJoinBusy, setGroupJoinBusy] = useState<Record<string, boolean>>({});
  const [viewersLoading, setViewersLoading] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [featuredSeries, setFeaturedSeries] = useState<ScrollSeriesDiscovery[]>([]);
  const [broadcastChannels, setBroadcastChannels] = useState<BroadcastChannelSummary[]>([]);
  const [officeHours, setOfficeHours] = useState<HighlightCommunityEvent[]>([]);
  const [listingJobsPool, setListingJobsPool] = useState<Job[]>([]);
  const [listingGigsPool, setListingGigsPool] = useState<Gig[]>([]);
  const [listingImageErrors, setListingImageErrors] = useState<Record<string, boolean>>({});
  const [employers, setEmployers] = useState<ProfileCard[]>([]);
  const [freelancers, setFreelancers] = useState<ProfileCard[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followingMap, setFollowingMap] = useState<Record<string, { followId?: string }>>({});
  const [followBusy, setFollowBusy] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchGroups, setSearchGroups] = useState<SearchGroupMap>(() => emptySearchGroups());
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRequestRef = useRef(0);
  const [stories, setStories] = useState<any[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [reels, setReels] = useState<ScrollVideo[]>([]);
  const [reelsLoading, setReelsLoading] = useState(false);
  const reelsRef = useRef<ScrollVideo[]>([]);
  const [scrollConfig, setScrollConfig] = useState<ScrollConfig | null>(null);
  const [scrollCreateOpen, setScrollCreateOpen] = useState(false);
  const [storyRailTab, setStoryRailTab] = useState<'stories' | 'reels'>('stories');
  const [activeStory, setActiveStory] = useState<any | null>(null);
  const [storyMediaPreviewOpen, setStoryMediaPreviewOpen] = useState(false);
  const [storyMediaDraftFile, setStoryMediaDraftFile] = useState<any | null>(null);
  const [storyTextOpen, setStoryTextOpen] = useState(false);
  const [storyEditOpen, setStoryEditOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<any | null>(null);
  useEffect(() => {
    feedItemsRef.current = feedItems;
  }, [feedItems]);
  const [storyDraft, setStoryDraft] = useState<StoryDraft>(() => ({
    content: '',
    visibility: 'public',
    ...getDefaultStoryTextDraft()
  }));
  const [storyEditDraft, setStoryEditDraft] = useState<StoryDraft>(() => ({
    content: '',
    visibility: 'public',
    ...getDefaultStoryTextDraft()
  }));
  const [storyPosting, setStoryPosting] = useState(false);
  const [storyMediaUploadBusy, setStoryMediaUploadBusy] = useState(false);
  const [storyMediaUploadLabel, setStoryMediaUploadLabel] = useState('');
  const [storyMediaUploadProgress, setStoryMediaUploadProgress] = useState(0);
  const [storyEditSaving, setStoryEditSaving] = useState(false);
  const [storyActionBusy, setStoryActionBusy] = useState<Record<string, boolean>>({});
  const [storyActionTarget, setStoryActionTarget] = useState<any | null>(null);
  const [storyCommentOpen, setStoryCommentOpen] = useState(false);
  const [storyRepostOpen, setStoryRepostOpen] = useState(false);
  const [storySendOpen, setStorySendOpen] = useState(false);
  const [storyDashOpen, setStoryDashOpen] = useState(false);
  const [storyTouchOverlayMode, setStoryTouchOverlayMode] = useState(false);
  const [storyOverlayVisible, setStoryOverlayVisible] = useState(true);
  const [storyCameraOpen, setStoryCameraOpen] = useState(false);
  const [storyCameraStream, setStoryCameraStream] = useState<MediaStream | null>(null);
  const storyVideoRef = useRef<HTMLVideoElement | null>(null);
  const storyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const storyDeviceInputRef = useRef<HTMLInputElement | null>(null);
  const storyCameraInputRef = useRef<HTMLInputElement | null>(null);
  const storyRecorderRef = useRef<MediaRecorder | null>(null);
  const storyChunksRef = useRef<Blob[]>([]);
  const [storyRecording, setStoryRecording] = useState(false);
  const [postDraft, setPostDraft] = useState<PostDraft>(createEmptyPostDraft);
  const [desktopComposerOpen, setDesktopComposerOpen] = useState(false);
  const [desktopComposerIntent, setDesktopComposerIntent] = useState<DesktopComposerIntent>('text');
  const [composerDraftNotice, setComposerDraftNotice] = useState<string | null>(null);
  const [composerStatusMessage, setComposerStatusMessage] = useState('');
  const [postLocationDetails, setPostLocationDetails] = useState<Partial<StructuredLocationFields> | null>(null);
  const [postLocationPickerOpen, setPostLocationPickerOpen] = useState(false);
  const [ownedBusinessPages, setOwnedBusinessPages] = useState<PostAuthorOption[]>([]);
  const [ownedBusinessPagesLoading, setOwnedBusinessPagesLoading] = useState(false);
  const [postAuthorScopeId, setPostAuthorScopeId] = useState('user');
  const [posting, setPosting] = useState(false);
  const publishGuardRef = useRef(createPublishGuard());
  /** Tracks media count for multi-file validation without stale-closure races. */
  const postMediaCountRef = useRef(0);
  /** Latest media snapshot for unmount blob cleanup. */
  const postMediaItemsRef = useRef<PostMediaItem[]>([]);
  /** Stable close/save path — avoid recreating onClose every keystroke (focus trap churn). */
  const postDraftRef = useRef(postDraft);
  const postingRef = useRef(posting);
  const postAuthorScopeIdRef = useRef(postAuthorScopeId);
  const composerDraftKey = useMemo(
    () =>
      buildComposerDraftKey({
        userId: user?.id,
        surface: 'member-home',
        identityId: postAuthorScopeId || 'user'
      }),
    [postAuthorScopeId, user?.id]
  );
  const composerDraftKeyRef = useRef(composerDraftKey);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRunningMode, setAiRunningMode] = useState<PostEnhanceMode | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiSuggestionMode, setAiSuggestionMode] = useState<PostEnhanceMode | null>(null);
  const [aiSuggestionOpen, setAiSuggestionOpen] = useState(false);
  const [aiOriginalText, setAiOriginalText] = useState('');
  const [aiCompareView, setAiCompareView] = useState<'compare' | 'ai'>('compare');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestionWarning, setAiSuggestionWarning] = useState<string | null>(null);
  const [insightCollapsedByPost, setInsightCollapsedByPost] = useState<Record<string, boolean>>({});
  const [revealedGraphicPosts, setRevealedGraphicPosts] = useState<Record<string, boolean>>({});
  const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null);
  const [expandedPost, setExpandedPost] = useState<any | null>(null);
  const postMediaInputRef = useRef<HTMLInputElement | null>(null);
  const postCameraInputRef = useRef<HTMLInputElement | null>(null);
  const postTitleInputRef = useRef<HTMLInputElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [projectBriefOpen, setProjectBriefOpen] = useState(false);
  const [projectBriefPrompt, setProjectBriefPrompt] = useState('');
  const [projectBriefGenerating, setProjectBriefGenerating] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sliderItems, setSliderItems] = useState<any[]>([]);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const ownedBusinessPagesLoadedRef = useRef(false);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const sidebarRefreshTimeoutRef = useRef<number | null>(null);
  const adImpressionsRef = useRef<Set<string>>(new Set());
  const postMediaTapTimersRef = useRef<Record<string, number>>({});
  const postMediaLastTapAtRef = useRef<Record<string, number>>({});
  const storyGestureStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    feedItemsRef.current = feedItems;
  }, [feedItems]);

  useEffect(() => {
    reelsRef.current = reels;
  }, [reels]);
  const storyOverlayHideTimerRef = useRef<number | null>(null);
  const storyAutoAdvanceTimerRef = useRef<number | null>(null);
  const storyLastTapAtRef = useRef(0);
  const [selfProfileCover, setSelfProfileCover] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(hover: none), (pointer: coarse)');
    const sync = () => setStoryTouchOverlayMode(query.matches);
    sync();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', sync);
      return () => query.removeEventListener('change', sync);
    }
    query.addListener(sync);
    return () => query.removeListener(sync);
  }, []);

  const revealStoryOverlay = useCallback(() => {
    if (!storyTouchOverlayMode) return;
    setStoryOverlayVisible(true);
  }, [storyTouchOverlayMode]);

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
        authorAvatar: String(resolveUserAvatarUrl(post?.author || post) || '').trim() || null,
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

  const memberHomeSettings = (settings as any)?.memberHome || {};
  const memberHomeWidgets = memberHomeSettings.widgets || {};
  const memberHomeFeed = memberHomeSettings.feed || {};
  const memberHomeAds = memberHomeSettings.ads || {};
  const mobileHomeLayout = (settings as any)?.mobileHomeLayout || (settings as any)?.mobile_home_layout || {};
  const mobilePostComposer = mobileHomeLayout.postComposer || mobileHomeLayout.post_composer || {};
  const mobilePostCard = mobileHomeLayout.postCard || mobileHomeLayout.post_card || {};
  const mentionsEnabled = mobilePostCard.mentionsEnabled !== false;
  const hashtagsEnabled = mobilePostCard.hashtagsEnabled !== false;

  const showDiscover = resolveToggle(content?.showDiscover, true, true);
  const showFollowing = resolveToggle(content?.showFollowing, true, true);
  const showTrending = resolveToggle(undefined, memberHomeFeed.enableTrendingTab, true);
  const showIntentModes = resolveToggle(undefined, memberHomeFeed.enableIntentModes, true);
  const showPipelineSave = resolveToggle(undefined, memberHomeFeed.enablePipelineSave, true);
  const showWhyThisPost = resolveToggle(undefined, memberHomeFeed.enableWhyThisPost, true);
  const showComposer = resolveToggle(content?.showComposer, memberHomeWidgets.postComposerEnabled, true);
  const showSearch = resolveToggle(content?.showSearch, true, true);
  const showStories = resolveToggle(content?.showStories, memberHomeWidgets.storiesEnabled, true);
  const showMessages = resolveToggle(content?.showMessages, memberHomeWidgets.recentMessagesEnabled, true);
  const showSlider = content?.showSlider !== false;
  const showProfiles = resolveToggle(content?.showProfiles, memberHomeWidgets.suggestionsEnabled, true);
  const showPagesRecommendations = resolveToggle(content?.showPagesRecommendations, memberHomeWidgets.pagesRecommendationsEnabled, true);
  const showProfileViewers = resolveToggle(content?.showProfileViewers, memberHomeWidgets.profileViewersEnabled, true);
  const showProfileViewing = content?.showProfileViewing !== false;
  const showJobs = content?.showJobs !== false;
  const showEmployers = content?.showEmployers !== false;
  const showGigs = content?.showGigs !== false;
  const showFreelancers = content?.showFreelancers !== false;
  const showCategoriesFilter = resolveToggle(undefined, memberHomeWidgets.categoriesFilterEnabled, true);
  const showSidebarAds =
    resolveToggle(undefined, memberHomeAds.enabled, false) &&
    resolveToggle(undefined, memberHomeWidgets.rightSidebarAdsEnabled, true);
  const showFeaturedSidebarAd = resolveToggle(undefined, memberHomeAds.leftSidebarFeaturedEnabled, true);
  const showTopSidebarAd = showSidebarAds && resolveToggle(undefined, memberHomeAds.rightSidebarTopEnabled, true);
  const showMiddleSidebarAd = showSidebarAds && resolveToggle(undefined, memberHomeAds.rightSidebarMiddleEnabled, true);
  const postDensity = String(memberHomeFeed.postDensity || 'comfortable').toLowerCase() === 'compact' ? 'compact' : 'comfortable';
  const defaultIntentFeedTab: FeedTab = (() => {
    const configured = normalizeFeedTabValue(memberHomeFeed.defaultIntentMode);
    if (configured && configured !== 'latest' && configured !== 'trending') {
      return configured;
    }
    return 'for_you';
  })();

  const defaultFeedTab: FeedTab = (() => {
    const explicit = normalizeFeedTabValue(memberHomeFeed.defaultTab);
    if (showIntentModes) {
      if (explicit && explicit !== 'latest') return explicit;
      const scopeFallback = String(memberHomeFeed.defaultScope || '').toLowerCase();
      if (scopeFallback === 'following') return 'following';
      return defaultIntentFeedTab;
    }

    if (explicit === 'following') return 'following';
    if (explicit === 'trending') return 'trending';
    if (explicit === 'latest') return 'latest';

    const scopeFallback = String(memberHomeFeed.defaultScope || '').toLowerCase();
    if (scopeFallback === 'following') return 'following';

    if (content?.showDiscover === false && content?.showFollowing !== false) return 'following';
    return 'latest';
  })();

  const adaptiveFeedPageSize = Math.max(6, Math.min(40, Number(profile.feedPageSize || 20)));
  const maxFeedItems = Math.max(4, Math.min(adaptiveFeedPageSize, Number(content?.maxFeedItems ?? adaptiveFeedPageSize) || adaptiveFeedPageSize));
  const maxStories = content?.maxStories ?? 12;
  const configuredMaxReels = Math.max(6, Number((content as any)?.maxReels ?? content?.maxStories ?? 12) || 12);
  const maxReels = Math.max(6, Math.min(configuredMaxReels, adaptiveFeedPageSize));
  const maxMessages = content?.maxMessages ?? 4;
  const maxSearchResults = content?.maxSearchResults ?? 8;
  const maxProfiles = content?.maxProfiles ?? 5;
  const maxPagesRecommendations = content?.maxPagesRecommendations ?? 5;
  const maxProfileViewers = content?.maxProfileViewers ?? 5;
  const maxProfileViewing = content?.maxProfileViewing ?? 5;
  const maxJobs = content?.maxJobs ?? 5;
  const maxGigs = content?.maxGigs ?? 5;
  const showListingCards = (content as any)?.showListingCards !== false;
  const listingCardEveryPosts = 2;
  const maxListingCardsPerFeed = Math.max(
    1,
    Math.min(12, Number((content as any)?.maxListingCardsPerFeed ?? 8) || 8)
  );

  const postComposerTopics = Array.isArray((mobilePostComposer as any)?.topics)
    ? (mobilePostComposer as any).topics
    : Array.isArray((mobilePostComposer as any)?.topicList)
      ? (mobilePostComposer as any).topicList
      : Array.isArray((mobilePostComposer as any)?.topic_list)
        ? (mobilePostComposer as any).topic_list
        : [];
  const postComposerLocations = Array.isArray((mobilePostComposer as any)?.locations)
    ? (mobilePostComposer as any).locations
    : Array.isArray((mobilePostComposer as any)?.locationList)
      ? (mobilePostComposer as any).locationList
      : Array.isArray((mobilePostComposer as any)?.location_list)
        ? (mobilePostComposer as any).location_list
        : [];

  const topics = dedupeLabels([
    ...(content?.topics?.length ? content.topics : defaultTopics),
    ...postComposerTopics
  ]);
  const regions = dedupeLabels([
    ...(content?.regions?.length ? content.regions : defaultRegions),
    ...postComposerLocations
  ]);
  const isFreelancer = (user?.role || '').toLowerCase() === 'freelancer';
  const isEmployer = (user?.role || '').toLowerCase() === 'employer';
  const isGuest = !user || String(user?.role || '').toLowerCase() === 'guest';
  const listingPoolLimit = Math.max(maxListingCardsPerFeed * 4, maxJobs * 2, maxGigs * 2, 12);
  const listingCardEntries = useMemo(() => {
    if (!showListingCards || !feedItems.length) return [];
    const slots = Math.min(
      maxListingCardsPerFeed,
      Math.max(1, Math.floor(feedItems.length / listingCardEveryPosts))
    );
    if (slots <= 0) return [];

    const jobPool = shuffleArray(dedupeById((listingJobsPool || []) as Array<Job & { id: string }>)).slice(0, slots * 2);
    const gigPool = shuffleArray(dedupeById((listingGigsPool || []) as Array<Gig & { id: string }>)).slice(0, slots * 2);
    const entries: Array<{ kind: 'job' | 'gig'; item: any }> = [];
    let preferJob = ((String(user?.id || 'guest').length + feedItems.length) % 2) === 0;

    while (entries.length < slots && (jobPool.length || gigPool.length)) {
      if (preferJob && jobPool.length) {
        entries.push({ kind: 'job', item: jobPool.shift() });
      } else if (!preferJob && gigPool.length) {
        entries.push({ kind: 'gig', item: gigPool.shift() });
      } else if (jobPool.length) {
        entries.push({ kind: 'job', item: jobPool.shift() });
      } else if (gigPool.length) {
        entries.push({ kind: 'gig', item: gigPool.shift() });
      }
      preferJob = !preferJob;
    }

    return entries.filter((entry) => Boolean(entry.item?.id));
  }, [
    showListingCards,
    user?.id,
    feedItems.length,
    maxListingCardsPerFeed,
    listingCardEveryPosts,
    listingJobsPool,
    listingGigsPool
  ]);
  const currentUserId = String((user as any)?.id || (user as any)?.user_id || '').trim();
  const feedTabStorageKey = `member_home_feed_tab:${currentUserId || 'guest'}`;
  const feedCacheKey = `member_home_feed_cache:v4:${currentUserId || 'guest'}`;
  const feedTabInitializedRef = useRef(false);
  const [feedTabReady, setFeedTabReady] = useState(false);
  const currentUsername = String((user as any)?.username || (user as any)?.user_name || '').trim();
  const userHeadline = user?.title || (user as any)?.headline || (user as any)?.tagline || user?.role || 'Member';
  const userLocation = user?.location || (user as any)?.country || '';
  const resolvedUserAvatar = resolveUserAvatarUrl(user);
  const composerTitle = content?.composerTitle || 'Share a quick update or idea with your network.';
  const userPostAuthorOption = useMemo<PostAuthorOption>(
    () => ({
      id: 'user',
      type: 'user',
      label: String(user?.name || currentUsername || 'You').trim() || 'You',
      subtitle: userHeadline || 'Post as yourself',
      avatarUrl: resolvedUserAvatar || null,
      pageId: null,
      slug: null
    }),
    [currentUsername, resolvedUserAvatar, user?.name, userHeadline]
  );
  const desktopPostAuthorOptions = useMemo(
    () => [userPostAuthorOption, ...ownedBusinessPages],
    [ownedBusinessPages, userPostAuthorOption]
  );
  const activePostAuthor = useMemo(
    () =>
      desktopPostAuthorOptions.find((option) => option.id === postAuthorScopeId) || userPostAuthorOption,
    [desktopPostAuthorOptions, postAuthorScopeId, userPostAuthorOption]
  );
  const activePostBusinessPageId = activePostAuthor.type === 'page' ? activePostAuthor.pageId || null : null;
  const postLocationSummary = composePostLocationValue(
    getStructuredLocationLabel(postLocationDetails) || String(postDraft.location || '').trim(),
    postDraft.region
  );
  const profileViewersTitle = content?.profileViewersTitle || 'Profile viewers';
  const profileViewingTitle = content?.profileViewingTitle || 'Recently viewed';
  const storyPreviewStyle = getStoryTextStyle(storyDraft);
  const storyEditPreviewStyle = getStoryTextStyle(storyEditDraft);

  useEffect(() => {
    if (!desktopPostAuthorOptions.some((option) => option.id === postAuthorScopeId)) {
      setPostAuthorScopeId('user');
    }
  }, [desktopPostAuthorOptions, postAuthorScopeId]);

  useEffect(() => {
    if (!desktopComposerOpen || !user?.id || ownedBusinessPagesLoadedRef.current) return;
    let active = true;
    setOwnedBusinessPagesLoading(true);
    CommunityService.getMyBusinessPages()
      .then((pages) => {
        if (!active) return;
        const normalized = (Array.isArray(pages) ? pages : [])
          .map(normalizeOwnedBusinessPage)
          .filter((entry): entry is PostAuthorOption => Boolean(entry));
        setOwnedBusinessPages(normalized);
        ownedBusinessPagesLoadedRef.current = true;
      })
      .catch((error) => {
        console.error('Unable to load owned business pages for desktop composer', error);
        if (!active) return;
        setOwnedBusinessPages([]);
        ownedBusinessPagesLoadedRef.current = true;
      })
      .finally(() => {
        if (active) setOwnedBusinessPagesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [desktopComposerOpen, user?.id]);

  useEffect(() => {
    if (!desktopComposerOpen) return;
    const timer = window.setTimeout(() => {
      if (desktopComposerIntent === 'article') {
        postTitleInputRef.current?.focus();
      } else {
        composerInputRef.current?.focus();
      }
      if (desktopComposerIntent === 'photo' || desktopComposerIntent === 'video') {
        postMediaInputRef.current?.click();
      }
    }, 140);
    return () => window.clearTimeout(timer);
  }, [desktopComposerIntent, desktopComposerOpen]);

  // Keep multi-file attach validation + unmount cleanup in sync with draft media.
  useEffect(() => {
    postMediaCountRef.current = postDraft.media.length;
    postMediaItemsRef.current = postDraft.media;
  }, [postDraft.media]);

  // Keep latest draft snapshot for stable close/save callbacks (must not remount editor/focus trap).
  useEffect(() => {
    postDraftRef.current = postDraft;
  }, [postDraft]);
  useEffect(() => {
    postingRef.current = posting;
  }, [posting]);
  useEffect(() => {
    postAuthorScopeIdRef.current = postAuthorScopeId;
  }, [postAuthorScopeId]);
  useEffect(() => {
    composerDraftKeyRef.current = composerDraftKey;
  }, [composerDraftKey]);

  // Persist text/settings draft while typing (no media bytes).
  useEffect(() => {
    if (!user?.id) return;
    const timer = window.setTimeout(() => {
      saveComposerDraft(composerDraftKey, {
        title: postDraft.title,
        content: postDraft.content,
        tags: postDraft.tags,
        mentions: postDraft.mentions,
        topic: postDraft.topic,
        region: postDraft.region,
        location: postDraft.location,
        visibility: postDraft.visibility,
        commentPolicy: postDraft.commentPolicy,
        graphicWarning: postDraft.graphicWarning,
        isAIEnhanced: postDraft.isAIEnhanced,
        aiInsightPreference: postDraft.aiInsightPreference,
        authorScopeId: postAuthorScopeId
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [
    composerDraftKey,
    postAuthorScopeId,
    postDraft.aiInsightPreference,
    postDraft.commentPolicy,
    postDraft.content,
    postDraft.graphicWarning,
    postDraft.isAIEnhanced,
    postDraft.location,
    postDraft.mentions,
    postDraft.region,
    postDraft.tags,
    postDraft.title,
    postDraft.topic,
    postDraft.visibility,
    user?.id
  ]);

  // Revoke any remaining blob previews on unmount (navigation / teardown).
  useEffect(() => {
    return () => {
      postMediaItemsRef.current.forEach((item) => revokePreviewUrl(item.url));
    };
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
      return filterActiveStories(next).slice(0, maxStories);
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
  }, [filterActiveStories, maxStories]);

  const buildProfileUrl = useCallback((entry?: { id?: string | null; username?: string | null }) => {
    const handle = (entry?.username || '').toString().trim().replace(/^@+/, '');
    if (handle) return `/u/${handle}`;
    const id = (entry?.id || '').toString().trim();
    if (id) return `/profile/${id}`;
    if (currentUserId) return `/profile/${currentUserId}`;
    return '/profile/edit';
  }, [currentUserId]);
  const buildSeriesUrl = useCallback((seriesId?: string | null) => {
    const id = String(seriesId || '').trim();
    if (!id) return '/scroll';
    return `/scroll?series=${encodeURIComponent(id)}`;
  }, []);
  const buildPageUrl = useCallback((page?: { slug?: string | null; handle?: string | null }) => {
    const slug = String(page?.slug || page?.handle || '').trim().replace(/^@+/, '');
    if (!slug) return '/community';
    return `/company/${encodeURIComponent(slug)}`;
  }, []);
  const resolveSearchItemUrl = useCallback(
    (item: any, normalizedType?: SearchGroupKey | string | undefined) => {
      const direct = String(item?.url || item?.link || item?.href || '').trim();
      if (direct) return direct;

      const kind = String(normalizedType || item?.type || item?.kind || item?.entityType || item?.category || '')
        .trim()
        .toLowerCase();

      if (kind === 'people' || kind === 'person' || kind === 'users' || kind === 'user') {
        return buildProfileUrl({
          id: item?.id || item?._id || item?.userId || item?.user_id || null,
          username: item?.username || item?.handle || item?.meta?.username || null
        });
      }

      if (kind === 'pages' || kind === 'page') {
        return buildPageUrl({
          slug: item?.slug || item?.handle || item?.username || item?.meta?.slug || null,
          handle: item?.handle || item?.username || null
        });
      }

      if (kind === 'jobs' || kind === 'job') {
        const id = String(item?.slug || item?.id || item?._id || item?.jobId || item?.job_id || '').trim();
        return id ? `/jobs/${encodeURIComponent(id)}` : '';
      }

      if (kind === 'gigs' || kind === 'gig') {
        const id = String(item?.slug || item?.id || item?._id || item?.gigId || item?.gig_id || '').trim();
        return id ? `/gigs/${encodeURIComponent(id)}` : '';
      }

      if (kind === 'marketplace' || kind === 'marketplace_listing' || kind === 'listing' || kind === 'product' || kind === 'item') {
        const id = String(item?.slug || item?.id || item?._id || item?.listingId || item?.listing_id || '').trim();
        return id ? `/marketplace/listing/${encodeURIComponent(id)}` : '/marketplace';
      }

      if (kind === 'posts' || kind === 'post') {
        const id = String(item?.id || item?._id || item?.postId || item?.post_id || '').trim();
        return id ? `/post/${encodeURIComponent(id)}` : '';
      }

      return '';
    },
    [buildPageUrl, buildProfileUrl]
  );
  const normalizeSidebarAd = useCallback((ad: any): SidebarAdCard | null => {
    const id = String(ad?.id || '').trim();
    if (!id) return null;
    const media = Array.isArray(ad?.media) ? ad.media[0] : null;
    const mediaUrl = resolveAssetUrl(media?.url || ad?.imageUrl || ad?.mediaUrl || '');
    const mediaType =
      media && inferMediaType(media) === 'video'
        ? 'video'
        : /\.(mp4|mov|m4v|webm|ogg)(\?|$)/i.test(String(mediaUrl || '').toLowerCase())
          ? 'video'
          : 'image';
    return {
      id,
      title: String(ad?.title || 'Sponsored').trim() || 'Sponsored',
      body: String(ad?.body || ad?.description || '').trim(),
      ctaText: String(ad?.ctaText || ad?.cta || '').trim(),
      destinationUrl: String(ad?.destinationUrl || ad?.targetUrl || '').trim(),
      mediaUrl: mediaUrl || undefined,
      mediaType,
      placement: String(ad?.placement || '').trim() || undefined
    };
  }, []);
  const normalizeRecommendedPage = useCallback((page: any): RecommendedPageCard | null => {
    const source = page?.account || page || {};
    const id = String(source?.id || page?.entityId || page?.id || '').trim();
    if (!id) return null;
    const intel = resolvePageRecoPresentation(page);
    return {
      id,
      name: String(source?.name || page?.name || 'Business page').trim() || 'Business page',
      slug: source?.pageSlug || source?.slug || page?.slug || page?.handle || '',
      handle: source?.pageHandle || source?.handle || page?.handle || '',
      tagline: source?.headline || source?.tagline || page?.tagline || page?.description || '',
      industry: source?.industry || page?.industry || '',
      avatar: resolveUserAvatarUrl(source || page) || null,
      followersCount: Number(source?.followersCount || page?.followersCount || 0),
      isFollowing: Boolean(source?.isFollowing ?? page?.isFollowing),
      followId: source?.followId || page?.followId || null,
      reasons: intel.reasons,
      whyRecommended: intel.whyRecommended
    };
  }, []);
  const storyTitle = content?.storyTitle || 'Stories';
  const reelsTitleRaw = String((content as any)?.reelsTitle || '').trim();
  const reelsTitle = reelsTitleRaw ? reelsTitleRaw.replace(/\breels?\b/gi, 'Scroll') : 'Scroll';
  const feedTitle = content?.feedTitle || 'Home feed';
  const profilesTitle = content?.profilesTitle || 'Add to your feed';
  const pagesTitle = content?.pagesTitle || 'Pages to follow';
  const jobsTitle = content?.jobsTitle || 'Job recommendations';
  const gigsTitle = content?.gigsTitle || 'Gigs you can hire';
  const employersTitle = content?.employersTitle || 'Employers to follow';
  const freelancersTitle = content?.freelancersTitle || 'Freelancers to connect';
  const messagesTitle = content?.messagesTitle || 'Recent messages';
  const sliderTitle = content?.sliderTitle || 'Highlights';
  const featuredActionsTitle =
    content?.featuredActionsTitle || (content as any)?.featured_actions_title || 'Featured';
  const projectBriefQuickActionTitle =
    content?.projectBriefQuickActionTitle ||
    (content as any)?.project_brief_quick_action_title ||
    'Scrolitha Project Brief';
  const projectBriefQuickActionSubtitle =
    content?.projectBriefQuickActionSubtitle ||
    (content as any)?.project_brief_quick_action_subtitle ||
    'Draft a professional project brief with AI';
  const gigCreationQuickActionTitle =
    content?.gigCreationQuickActionTitle ||
    (content as any)?.gig_creation_quick_action_title ||
    'Scrolitha Gig Creation';
  const gigCreationQuickActionSubtitle =
    content?.gigCreationQuickActionSubtitle ||
    (content as any)?.gig_creation_quick_action_subtitle ||
    'Generate your gig setup with AI guidance';
  const searchPlaceholder = content?.searchPlaceholder || 'Search posts, jobs, gigs, people, pages, or marketplace items';
  const searchHint = content?.searchHint || 'Search across marketplace items, posts, jobs, gigs, people, and pages.';

  const normalizePost = useCallback((post: any): FeedPost => {
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
    const authorAvatar = resolveUserAvatarUrl(post.author || post);
    const authorType = post.author?.type || (post.businessPage ? 'business' : 'user');
    const authorUserId =
      post.authorUserId ||
      post.author_user_id ||
      post.author?.userId ||
      post.author?.user_id ||
      (authorType === 'user' ? authorId : null);
    const aiInsightTextRaw = post.aiInsightText ?? post.ai_insight_text ?? null;
    const aiInsightText =
      aiInsightTextRaw === null || aiInsightTextRaw === undefined
        ? null
        : String(aiInsightTextRaw).trim() || null;
    const baseAttachments = Array.isArray(post.attachments)
      ? post.attachments
      : Array.isArray(post.media)
        ? post.media
        : [];
    const syntheticVideoAttachment = resolveSyntheticVideoAttachment(post);
    const attachments =
      syntheticVideoAttachment && !baseAttachments.some((entry: any) => inferMediaType(entry || {}) === 'video')
        ? [syntheticVideoAttachment, ...baseAttachments]
        : baseAttachments;
    const tags = Array.isArray(post.tags) ? post.tags : [];
    const mentions = Array.isArray(post.mentions) ? post.mentions : [];

    return {
      id: post.id || `${authorId}-${Date.now()}`,
      title:
        readRenderableText(post.title) ||
        readRenderableText(post.headline) ||
        readRenderableText(post.subject) ||
        null,
      content:
        readRenderableText(post.content) ||
        readRenderableText(post.body) ||
        readRenderableText(post.text) ||
        readRenderableText(post.description) ||
        '',
      attachmentFileIds: Array.isArray(post.attachmentFileIds)
        ? post.attachmentFileIds
        : attachments.length > 0
          ? attachments.map((item: any) => item?.id || item?.fileId || item?.file_id).filter(Boolean)
          : [],
      attachments: attachments.map((item: any) => ({
        ...item,
        id: item.id || item.fileId || item.file_id || resolvePostAttachmentMediaUrl(item),
        url: resolvePostAttachmentMediaUrl(item) || item.url || '',
        name: item.name || item.originalName || item.filename,
        mimeType: item.mimeType || item.mime_type,
        type: item.type || inferMediaType(item),
        thumbnailUrl: resolvePostAttachmentPosterUrl(item) || item.thumbnailUrl || item.thumbnail_url || null,
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
      tags,
      mentions,
      topic: post.topic || null,
      topicSummary: Array.isArray(post.topicSummary)
        ? dedupeLabels(post.topicSummary.map((entry: string) => String(entry || '').trim()))
        : dedupeLabels([post.topic || '', ...(tags as string[])]),
      location: post.location || null,
      visibility: post.visibility,
      commentPolicy: post.commentPolicy || post.comment_policy || 'everyone',
      repostsEnabled: post.repostsEnabled ?? post.reposts_enabled ?? true,
      offerTags: normalizeContentOfferTags(post.offerTags ?? post.offer_tags),
      originalPost:
        post.originalPost && typeof post.originalPost === 'object'
          ? {
              id: post.originalPost.id,
              authorName: post.originalPost.authorName ?? post.originalPost.author_name ?? null,
              authorUsername: post.originalPost.authorUsername ?? post.originalPost.author_username ?? null,
              title: readRenderableText(post.originalPost.title) || null,
              content: readRenderableText(post.originalPost.content) || null
            }
          : null,
      isPinned: post.isPinned ?? post.is_pinned ?? false,
      isHighlighted: post.isHighlighted ?? post.is_highlighted ?? false,
      graphicWarning: Boolean(post.graphicWarning ?? post.graphic_warning ?? false),
      isAIEnhanced: Boolean(post.isAIEnhanced ?? post.is_ai_enhanced ?? false),
      dashGcoinTotal: Number(post.dashGcoinTotal ?? post.dash_gcoin_total ?? interactions.dashGcoinTotal ?? 0),
      aiInsightEnabled: Boolean(post.aiInsightEnabled ?? post.ai_insight_enabled ?? false),
      aiInsightGenerated: Boolean(
        post.aiInsightGenerated ??
          post.ai_insight_generated ??
          (aiInsightText ? true : false)
      ),
      aiInsightText,
      aiScore:
        post.aiScore !== undefined && post.aiScore !== null
          ? Number(post.aiScore)
          : post.ai_score !== undefined && post.ai_score !== null
            ? Number(post.ai_score)
            : null,
      interactions,
      ranking: (() => {
        const raw = post.ranking || undefined;
        if (!raw && !post.why && post.score == null && post.rankingScore == null) return undefined;
        const presentation = resolveFeedRankingPresentation(post);
        return {
          mode: raw?.mode || raw?.recipeKey || undefined,
          score:
            raw?.score != null
              ? Number(raw.score)
              : post.score != null || post.rankingScore != null
                ? Number(post.score ?? post.rankingScore)
                : undefined,
          primaryReason: presentation.primaryReason || raw?.primaryReason || raw?.primary_reason || null,
          reasons:
            presentation.reasons.length > 0
              ? presentation.reasons
              : Array.isArray(raw?.reasons)
                ? raw.reasons
                : presentation.primaryReason
                  ? [presentation.primaryReason]
                  : []
        };
      })(),
      pipelineState: post.pipelineState || undefined,
      userState: post.userState || post.user_state || {}
    };
  }, []);

  const syncCommentCount = useCallback((postId: string, nextCount: unknown) => {
    const parsed = Number(nextCount);
    const normalizedCount = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
    setCommentCounts((prev) => {
      if ((prev[postId] ?? 0) === normalizedCount) return prev;
      return { ...prev, [postId]: normalizedCount };
    });
  }, []);

  const resolvePostOwnerUserId = useCallback((post: FeedPost) => {
    const explicit = String(post.authorUserId || '').trim();
    if (explicit) return explicit;
    const authorType = String(post.author?.type || '').toLowerCase();
    if (authorType === 'user') return String(post.authorId || '').trim();
    return '';
  }, []);

  const applyPostUpdate = useCallback((updated: FeedPost) => {
    setFeedItems((prev) =>
      prev.map((item) =>
        item.id === updated.id
          ? {
              ...item,
              ...Object.fromEntries(Object.entries(updated).filter(([, value]) => value !== undefined)),
              title: updated.title !== undefined ? updated.title : item.title,
              content: updated.content !== undefined ? updated.content : item.content,
              attachmentFileIds:
                updated.attachmentFileIds !== undefined ? updated.attachmentFileIds : item.attachmentFileIds,
              attachments: updated.attachments !== undefined ? updated.attachments : item.attachments,
              tags: updated.tags !== undefined ? updated.tags : item.tags,
              mentions: updated.mentions !== undefined ? updated.mentions : item.mentions,
              topic: updated.topic !== undefined ? updated.topic : item.topic,
              topicSummary: updated.topicSummary !== undefined ? updated.topicSummary : item.topicSummary,
              location: updated.location !== undefined ? updated.location : item.location,
              author:
                updated.author !== undefined
                  ? { ...(item.author || {}), ...(updated.author || {}) }
                  : item.author,
              authorId: updated.authorId !== undefined ? updated.authorId : item.authorId,
              authorUserId: updated.authorUserId !== undefined ? updated.authorUserId : item.authorUserId,
              authorName: updated.authorName !== undefined ? updated.authorName : item.authorName,
              authorUsername: updated.authorUsername !== undefined ? updated.authorUsername : item.authorUsername,
              authorAvatar: updated.authorAvatar !== undefined ? updated.authorAvatar : item.authorAvatar,
              originalPost: updated.originalPost !== undefined ? updated.originalPost : item.originalPost,
              ranking: updated.ranking !== undefined ? updated.ranking : item.ranking,
              pipelineState:
                updated.pipelineState !== undefined
                  ? { ...(item.pipelineState || {}), ...(updated.pipelineState || {}) }
                  : item.pipelineState,
              interactions: updated.interactions
                ? { ...(item.interactions || {}), ...updated.interactions }
                : item.interactions,
              userState: updated.userState
                ? { ...(item.userState || {}), ...updated.userState }
                : item.userState
            }
          : item
      )
    );
    if (updated.interactions?.comments !== undefined) {
      syncCommentCount(updated.id, updated.interactions?.comments);
    }
  }, [syncCommentCount]);

  const togglePipelineSave = useCallback(
    async (post: FeedPost) => {
      if (!user) {
        showNotification('warning', 'Pipeline', 'Please sign in to save opportunities.');
        return;
      }

      if (pipelineBusyByPostId[post.id]) return;

      const nextSaved = !Boolean(post.pipelineState?.saved);
      setPipelineBusyByPostId((prev) => ({ ...prev, [post.id]: true }));
      try {
        if (nextSaved) {
          await PipelineService.save({
            entityType: 'POST',
            entityId: post.id,
            sourceSurface: 'member_home',
            meta: {
              topics: post.topicSummary?.length ? post.topicSummary : dedupeLabels([post.topic || '', ...(post.tags || [])]),
              authorId: post.authorUserId || post.authorId || post.author?.id || null,
              businessPageId: post.author?.type === 'business' ? post.author?.id || null : null,
              reason: post.ranking?.primaryReason || null
            }
          });
        } else {
          await PipelineService.remove('POST', post.id);
        }

        applyPostUpdate({
          id: post.id,
          pipelineState: { saved: nextSaved }
        } as FeedPost);
        showNotification('success', 'Pipeline', nextSaved ? 'Saved to your pipeline.' : 'Removed from your pipeline.');
      } catch (error: any) {
        showNotification('error', 'Pipeline', getApiErrorMessage(error, 'Unable to update pipeline status.'));
      } finally {
        setPipelineBusyByPostId((prev) => {
          const next = { ...prev };
          delete next[post.id];
          return next;
        });
      }
    },
    [applyPostUpdate, pipelineBusyByPostId, showNotification, user]
  );

  const loadFeed = useCallback(async (options?: { forceRetryOrchestrated?: boolean; hardReset?: boolean }) => {
    if (!user) return;
    // One in-flight initial/soft-refresh at a time (superseded by newer sequence).
    if (feedLoadingRef.current && !options?.hardReset) {
      // Allow tab/filter changes to supersede via request sequence below.
    }
    const requestId = ++feedLoadRequestIdRef.current;
    feedLoadingRef.current = true;
    const hadExistingContent = feedItemsRef.current.length > 0;
    // Never blank existing content: skeleton only when empty.
    if (!hadExistingContent) {
      setFeedLoading(true);
    }
    try {
      const scope = feedTab === 'following' ? 'following' : 'discover';
      const requestedMode =
        feedTab === 'latest'
          ? showIntentModes
            ? defaultIntentFeedTab
            : undefined
          : feedTab === 'trending'
            ? showIntentModes
              ? defaultIntentFeedTab
              : undefined
            : feedTab !== 'following'
              ? feedTab
              : undefined;
      const resolvedMode =
        requestedMode && String(requestedMode).toLowerCase() !== 'for_you' ? requestedMode : undefined;
      const payload: any = { limit: maxFeedItems, scope };
      if (resolvedMode) payload.mode = resolvedMode;
      if (scope === 'discover' && showCategoriesFilter) {
        if (feedTopic) payload.topic = feedTopic;
        if (feedRegion) payload.region = feedRegion;
      }
      const normalizeFeedItems = (sourceItems: any[]) =>
        (Array.isArray(sourceItems) ? sourceItems : [])
          .map((item) => {
            try {
              return normalizePost(item);
            } catch (normalizeError) {
              console.warn('Skipping malformed desktop feed post', normalizeError, item);
              return null;
            }
          })
          .filter((item): item is FeedPost => Boolean(item));
      const mergeFeedItems = (preferred: FeedPost[], fallback: FeedPost[]) =>
        dedupeById(
          [...preferred, ...fallback].filter(Boolean) as Array<FeedPost & { id?: string | null }>
        ) as FeedPost[];

      // Phase 3: try enterprise orchestrator first (cursor-only). Soft-fail → Phase 1 loaders.
      // Stay on legacy after a session failure unless hard refresh forces retry.
      const mayTryOrchestrated =
        options?.forceRetryOrchestrated ||
        options?.hardReset ||
        !feedOrchestratedFailedRef.current ||
        feedTransportRef.current === 'orchestrated';
      if (mayTryOrchestrated) {
      try {
        // Abort only superseded initial requests (not load-more).
        feedAbortRef.current?.abort();
        const controller = new AbortController();
        feedAbortRef.current = controller;
        const orchestratedMode =
          scope === 'following'
            ? 'following'
            : resolvedMode || (showIntentModes ? defaultIntentFeedTab : 'for_you') || 'for_you';
        const orchestrated = await MemberFeedService.tryFetchPage({
          surface: 'member_home',
          mode: String(orchestratedMode),
          limit: maxFeedItems,
          topic: scope === 'discover' && showCategoriesFilter ? feedTopic || undefined : undefined,
          region: scope === 'discover' && showCategoriesFilter ? feedRegion || undefined : undefined,
          signal: controller.signal,
          timeoutMs: desktopConstrainedFeed ? 12000 : 18000
        });
        if (isStaleFeedResponse(requestId, feedLoadRequestIdRef.current)) return;
        if (orchestrated && Array.isArray(orchestrated.posts)) {
          const normalized = normalizeFeedItems(orchestrated.posts);
          if (normalized.length > 0 || orchestrated.hasMore) {
            feedTransportRef.current = 'orchestrated';
            feedOrchestratedFailedRef.current = false;
            feedEmptyPageStreakRef.current = 0;
            feedDiscoveryUsedRef.current = true; // skip Phase 1 discovery supplement while orchestrated
            feedTerminalRef.current = !orchestrated.hasMore && normalized.length === 0;
            setFeedTerminal(feedTerminalRef.current);
            // Soft refresh: merge first page over existing pages — never drop already-loaded items.
            const nextItems =
              hadExistingContent && !options?.hardReset
                ? (mergeUniqueFeedItems(normalized, feedItemsRef.current).merged as FeedPost[])
                : normalized;
            commitFeedItems(nextItems, {
              forceResetWindow: Boolean(options?.hardReset) && !hadExistingContent
            });
            // Only reset cursor on deliberate hard reset / empty prior list.
            if (!hadExistingContent || options?.hardReset) {
              feedNextCursorRef.current = orchestrated.nextCursor;
              setFeedNextCursor(orchestrated.nextCursor);
              feedOffsetFallbackRef.current = false;
              setFeedOffsetFallbackEnabled(false);
            }
            logFeedLifecycle({
              surface: 'member_home',
              transport: 'orchestrated',
              kind: hadExistingContent ? 'soft_refresh' : 'initial',
              sequence: requestId,
              cursor: null,
              nextCursor: orchestrated.nextCursor,
              itemCount: normalized.length,
              hasMore: orchestrated.hasMore,
              feedCountBefore: hadExistingContent ? feedItemsRef.current.length : 0,
              feedCountAfter: normalized.length
            });
            if (orchestrated.jobs.length) {
              setListingJobsPool((prev) =>
                dedupeById([...(orchestrated.jobs as any[]), ...((prev || []) as any[])]) as any
              );
            }
            if (orchestrated.gigs.length) {
              setListingGigsPool((prev) =>
                dedupeById([...(orchestrated.gigs as any[]), ...((prev || []) as any[])]) as any
              );
            }
            return;
          }
        }
        // Empty orchestrated response → try Phase 1 without marking permanent failure.
      } catch (orchestratorError) {
        console.warn('Member-home orchestrated feed unavailable; using Phase 1 continuous feed', orchestratorError);
        feedOrchestratedFailedRef.current = true;
        feedTransportRef.current = resolveTransportAfterFailure(feedTransportRef.current, 'orchestrated');
      }
      }
      feedTransportRef.current = 'legacy';
      const shouldFetchCommunityBaseline = scope === 'discover' && !feedTopic && !feedRegion;
      const applyImmediateFeedSeed = (itemsToSeed: FeedPost[]) => {
        if (!itemsToSeed.length) return;
        if (requestId !== feedLoadRequestIdRef.current) return;
        commitFeedItems(itemsToSeed);
      };
      const feedRequest = withFeedFallbackTimeout(
        CommunityService.getFeed(payload),
        desktopConstrainedFeed ? 15000 : 18000,
        null
      );
      const serviceBaselineRequest = shouldFetchCommunityBaseline
        ? withFeedFallbackTimeout(CommunityService.getPosts({ limit: maxFeedItems }), 12000, [] as any[])
        : Promise.resolve([] as any[]);
      const publicBaselineRequest = shouldFetchCommunityBaseline
        ? withFeedFallbackTimeout(fetchPublicCommunityPostsBaseline(maxFeedItems), 9000, [] as any[])
        : Promise.resolve([] as any[]);
      void publicBaselineRequest
        .then((value) => {
          const normalizedBaselineItems = normalizeFeedItems(extractFeedItems(value));
          if (normalizedBaselineItems.length > 0 && feedItemsRef.current.length === 0) {
            applyImmediateFeedSeed(normalizedBaselineItems);
          }
        })
        .catch(() => {
          // Ignore seeding failures and continue with the merged load below.
        });
      const [feedResult, serviceBaselineResult, publicBaselineResult] = await Promise.allSettled([
        feedRequest,
        serviceBaselineRequest,
        publicBaselineRequest
      ]);
      if (isStaleFeedResponse(requestId, feedLoadRequestIdRef.current)) return;
      const data = feedResult.status === 'fulfilled' ? feedResult.value : null;
      let nextCursor = extractFeedCursor(data);
      let items = extractFeedItems(data);
      const normalizedServiceBaselineItems =
        serviceBaselineResult.status === 'fulfilled'
          ? normalizeFeedItems(extractFeedItems(serviceBaselineResult.value))
          : [];
      const normalizedPublicBaselineItems =
        publicBaselineResult.status === 'fulfilled'
          ? normalizeFeedItems(extractFeedItems(publicBaselineResult.value))
          : [];
      const normalizedBaselineItems = mergeFeedItems(
        normalizedPublicBaselineItems,
        normalizedServiceBaselineItems
      );
      if (normalizedBaselineItems.length > 0 && feedItemsRef.current.length === 0) {
        applyImmediateFeedSeed(normalizedBaselineItems);
      }
      if (
        scope === 'discover' &&
        resolvedMode &&
        !feedTopic &&
        !feedRegion &&
        items.length === 0
      ) {
        try {
          const fallbackData = await CommunityService.getFeed({ limit: maxFeedItems, scope: 'discover' });
          const fallbackItems = extractFeedItems(fallbackData);
          if (fallbackItems.length > 0) {
            items = fallbackItems;
            nextCursor = extractFeedCursor(fallbackData);
          }
        } catch (fallbackError) {
          console.warn('Failed to load desktop discover feed fallback', fallbackError);
        }
      }
      if (isStaleFeedResponse(requestId, feedLoadRequestIdRef.current)) return;
      const normalizedFeedItems = normalizeFeedItems(items);
      let normalized = normalizedFeedItems;
      if (shouldFetchCommunityBaseline) {
        normalized = mergeFeedItems(normalizedFeedItems, normalizedBaselineItems);
      }
      if (normalized.length === 0 && shouldFetchCommunityBaseline) {
        try {
          const emergencyPosts = normalizeFeedItems(
            extractFeedItems(
              await withFeedFallbackTimeout(fetchPublicCommunityPostsBaseline(maxFeedItems), 9000, [] as any[])
            )
          );
          if (emergencyPosts.length > 0) {
            normalized = emergencyPosts;
          }
        } catch (emergencyBaselineError) {
          console.warn('Failed to load emergency desktop community baseline', emergencyBaselineError);
        }
      }
      if (normalized.length === 0 && shouldFetchCommunityBaseline) {
        try {
          const emergencyPosts = normalizeFeedItems(
            extractFeedItems(
              await withFeedFallbackTimeout(CommunityService.getPosts({ limit: maxFeedItems }), 12000, [] as any[])
            )
          );
          if (emergencyPosts.length > 0) {
            normalized = emergencyPosts;
          }
        } catch (emergencyPostsError) {
          console.warn('Failed to load emergency desktop posts feed', emergencyPostsError);
        }
      }
      if (normalized.length === 0 && shouldFetchCommunityBaseline) {
        try {
          const authoritativePosts = normalizeFeedItems(
            extractFeedItems(await CommunityService.getPosts({ limit: maxFeedItems }))
          );
          if (requestId !== feedLoadRequestIdRef.current) return;
          if (authoritativePosts.length > 0) {
            normalized = authoritativePosts;
          }
        } catch (authoritativePostsError) {
          console.warn('Failed to load authoritative desktop posts baseline', authoritativePostsError);
        }
      }
      if (normalized.length === 0 && shouldFetchCommunityBaseline) {
        try {
          const authoritativePublicPosts = normalizeFeedItems(
            extractFeedItems(await fetchPublicCommunityPostsBaseline(maxFeedItems))
          );
          if (requestId !== feedLoadRequestIdRef.current) return;
          if (authoritativePublicPosts.length > 0) {
            normalized = authoritativePublicPosts;
          }
        } catch (authoritativePublicPostsError) {
          console.warn('Failed to load authoritative desktop public posts baseline', authoritativePublicPostsError);
        }
      }
      if (normalized.length === 0 && scope === 'discover') {
        try {
          const authoritativeFeedResponse = await CommunityService.getFeed(payload);
          const authoritativeFeedItems = normalizeFeedItems(extractFeedItems(authoritativeFeedResponse));
          if (requestId !== feedLoadRequestIdRef.current) return;
          if (authoritativeFeedItems.length > 0) {
            nextCursor = nextCursor || extractFeedCursor(authoritativeFeedResponse);
            normalized = shouldFetchCommunityBaseline
              ? mergeFeedItems(authoritativeFeedItems, normalizedBaselineItems)
              : authoritativeFeedItems;
          }
        } catch (authoritativeFeedError) {
          console.warn('Failed to load authoritative desktop discover feed', authoritativeFeedError);
        }
      }
      if (
        normalized.length === 0 &&
        scope === 'discover' &&
        resolvedMode &&
        !feedTopic &&
        !feedRegion
      ) {
        try {
          const authoritativeFallbackResponse = await CommunityService.getFeed({ limit: maxFeedItems, scope: 'discover' });
          const authoritativeFallbackItems = normalizeFeedItems(extractFeedItems(authoritativeFallbackResponse));
          if (requestId !== feedLoadRequestIdRef.current) return;
          if (authoritativeFallbackItems.length > 0) {
            nextCursor = nextCursor || extractFeedCursor(authoritativeFallbackResponse);
            normalized = authoritativeFallbackItems;
          }
        } catch (authoritativeFallbackError) {
          console.warn('Failed to load authoritative desktop discover fallback feed', authoritativeFallbackError);
        }
      }
      const sorted =
        feedTab === 'trending'
          ? [...normalized].sort((a, b) => {
              const aStats = a.interactions || {};
              const bStats = b.interactions || {};
              const aScore =
                Number(aStats.likes || 0) +
                Number(aStats.comments || 0) * 2 +
                Number(aStats.reposts || 0) * 2 +
                Number(aStats.shares || 0) * 3;
              const bScore =
                Number(bStats.likes || 0) +
                Number(bStats.comments || 0) * 2 +
                Number(bStats.reposts || 0) * 2 +
                Number(bStats.shares || 0) * 3;
              return bScore - aScore;
            })
          : normalized;
      if (isStaleFeedResponse(requestId, feedLoadRequestIdRef.current)) return;
      const shouldPreserveExistingFeed =
        sorted.length === 0 &&
        feedItemsRef.current.length > 0 &&
        scope === 'discover' &&
        !feedTopic &&
        !feedRegion;
      const softMerged =
        hadExistingContent && !options?.hardReset && sorted.length > 0
          ? (mergeUniqueFeedItems(sorted, feedItemsRef.current).merged as FeedPost[])
          : sorted;
      const effectiveFeedItems = shouldPreserveExistingFeed ? feedItemsRef.current : softMerged;
      feedEmptyPageStreakRef.current = 0;
      // Soft refresh keeps discovery/offset state so pagination is not reset.
      if (!hadExistingContent || options?.hardReset) {
        feedDiscoveryUsedRef.current = false;
        feedTerminalRef.current = false;
        setFeedTerminal(false);
      }
      commitFeedItems(effectiveFeedItems, { forceResetWindow: Boolean(options?.hardReset) && !hadExistingContent });
      if (!hadExistingContent || options?.hardReset || shouldPreserveExistingFeed) {
        const preservedCursor =
          shouldPreserveExistingFeed || (hadExistingContent && !options?.hardReset)
            ? feedNextCursorRef.current
            : nextCursor;
        if (!hadExistingContent || options?.hardReset) {
          feedNextCursorRef.current = nextCursor;
          setFeedNextCursor(nextCursor);
          const offsetEnabled =
            Boolean(effectiveFeedItems.length) &&
            !nextCursor &&
            scope === 'discover' &&
            !feedTopic &&
            !feedRegion;
          feedOffsetFallbackRef.current = offsetEnabled;
          setFeedOffsetFallbackEnabled(offsetEnabled);
        } else if (shouldPreserveExistingFeed) {
          feedNextCursorRef.current = preservedCursor;
          setFeedNextCursor(preservedCursor);
        }
      }
      if (effectiveFeedItems.length > 0) {
        try {
          window.localStorage.setItem(
            feedCacheKey,
            JSON.stringify({
              ts: Date.now(),
              items: effectiveFeedItems.slice(0, 80)
            })
          );
        } catch {
          // Ignore cache write failures.
        }
      }
      if (shouldPreserveExistingFeed) {
        return;
      }
      const followSeed: Record<string, boolean> = {};
      const authorIds = new Set<string>();
      sorted.forEach((post) => {
        const authorType = String(post.author?.type || 'user').toLowerCase();
        const authorId = String(post.author?.id || post.authorId || '').trim();
        if (authorType !== 'user' || !authorId || String(user.id) === authorId) return;
        authorIds.add(authorId);
        if (post.viewer?.isFollowingAuthor !== undefined) {
          followSeed[authorId] = Boolean(post.viewer.isFollowingAuthor);
        }
      });
      if (Object.keys(followSeed).length) {
        setFollowStatuses(followSeed);
      }
      if (authorIds.size) {
        try {
          const statusMap = await CommunityService.getFollowStatus(Array.from(authorIds));
          setFollowStatuses(statusMap);
        } catch (error) {
          console.warn('Failed to hydrate follow status map for feed:', error);
        }
      }
      const counts: Record<string, number> = {};
      sorted.forEach((post) => {
        counts[post.id] = post.interactions?.comments ?? 0;
      });
      setCommentCounts(counts);
    } catch (error) {
      if (isStaleFeedResponse(requestId, feedLoadRequestIdRef.current)) return;
      console.error('Failed to load home feed', error);
      // Soft failure: keep existing list and pagination state.
      if (!feedItemsRef.current.length) {
        feedNextCursorRef.current = null;
        setFeedNextCursor(null);
        feedOffsetFallbackRef.current = false;
        setFeedOffsetFallbackEnabled(false);
        try {
          const raw = window.localStorage.getItem(feedCacheKey);
          const parsed = raw ? (JSON.parse(raw) as { items?: FeedPost[] }) : null;
          const cachedItems = Array.isArray(parsed?.items) ? parsed.items : [];
          if (cachedItems.length > 0) {
            commitFeedItems(cachedItems);
            return;
          }
        } catch {
          // Ignore cache read failures.
        }
      }
    } finally {
      if (requestId === feedLoadRequestIdRef.current) {
        feedLoadingRef.current = false;
        setFeedLoading(false);
      }
    }
  }, [
    commitFeedItems,
    defaultIntentFeedTab,
    desktopConstrainedFeed,
    extractFeedCursor,
    extractFeedItems,
    feedCacheKey,
    feedRegion,
    feedTab,
    feedTopic,
    maxFeedItems,
    normalizePost,
    showCategoriesFilter,
    showIntentModes,
    user
  ]);

  const loadMoreFeed = useCallback(async () => {
    if (!user || feedLoadingMoreRef.current || feedTerminalRef.current || feedLoadingRef.current) return;
    const cursor = String(feedNextCursorRef.current || '').trim();
    if (
      shouldSkipDuplicateCursorRequest({
        cursor,
        inFlightCursor: feedInFlightCursorRef.current,
        loadMoreInFlight: feedLoadingMoreRef.current,
        lastCompletedCursor: feedLastCompletedCursorRef.current,
        lastCompletedAddedCount: feedLastCompletedAddedRef.current
      })
    ) {
      return;
    }

    const scope = feedTab === 'following' ? 'following' : 'discover';
    const canUseOffsetFallback =
      !cursor &&
      feedOffsetFallbackRef.current &&
      scope === 'discover' &&
      !feedTopic &&
      !feedRegion &&
      feedItemsRef.current.length > 0;
    const canUseDiscoverySupplement =
      !cursor &&
      !canUseOffsetFallback &&
      !feedDiscoveryUsedRef.current &&
      scope === 'discover' &&
      !feedTopic &&
      !feedRegion;
    if (!cursor && !canUseOffsetFallback && !canUseDiscoverySupplement) {
      feedTerminalRef.current = true;
      setFeedTerminal(true);
      return;
    }
    const requestedMode =
      feedTab === 'latest'
        ? showIntentModes
          ? defaultIntentFeedTab
          : undefined
        : feedTab === 'trending'
          ? showIntentModes
            ? defaultIntentFeedTab
            : undefined
          : feedTab !== 'following'
            ? feedTab
            : undefined;
    const resolvedMode =
      requestedMode && String(requestedMode).toLowerCase() !== 'for_you' ? requestedMode : undefined;
    const payload: any = { limit: maxFeedItems, scope, cursor };
    if (!canUseOffsetFallback && !canUseDiscoverySupplement) {
      if (resolvedMode) payload.mode = resolvedMode;
      if (scope === 'discover' && showCategoriesFilter) {
        if (feedTopic) payload.topic = feedTopic;
        if (feedRegion) payload.region = feedRegion;
      }
    }

    feedLoadingMoreRef.current = true;
    feedInFlightCursorRef.current = cursor || null;
    setFeedLoadingMore(true);
    try {
      // Phase 3: continue on orchestrator cursor when transport is orchestrated.
      if (feedTransportRef.current === 'orchestrated' && cursor && !feedOrchestratedFailedRef.current) {
        try {
          const orchestratedMode =
            scope === 'following'
              ? 'following'
              : resolvedMode || (showIntentModes ? defaultIntentFeedTab : 'for_you') || 'for_you';
          const page = await MemberFeedService.tryFetchPage({
            surface: 'member_home',
            mode: String(orchestratedMode),
            limit: maxFeedItems,
            cursor,
            topic: scope === 'discover' && showCategoriesFilter ? feedTopic || undefined : undefined,
            region: scope === 'discover' && showCategoriesFilter ? feedRegion || undefined : undefined,
            timeoutMs: desktopConstrainedFeed ? 12000 : 18000
          });
          if (page) {
            const appendedItems = (page.posts || [])
              .map((item) => {
                try {
                  return normalizePost(item);
                } catch {
                  return null;
                }
              })
              .filter((item): item is FeedPost => Boolean(item));
            const { addedCount } = appendFeedItems(appendedItems);
            if (addedCount > 0) feedEmptyPageStreakRef.current = 0;
            else feedEmptyPageStreakRef.current += 1;
            feedLastCompletedCursorRef.current = cursor;
            feedLastCompletedAddedRef.current = addedCount;
            if (page.jobs.length) {
              setListingJobsPool((prev) =>
                dedupeById([...((prev || []) as any[]), ...(page.jobs as any[])]) as any
              );
            }
            if (page.gigs.length) {
              setListingGigsPool((prev) =>
                dedupeById([...((prev || []) as any[]), ...(page.gigs as any[])]) as any
              );
            }
            const stopUnchanged = shouldStopUnchangedCursorLoop({
              requestedCursor: cursor,
              returnedCursor: page.nextCursor,
              uniqueAddedCount: addedCount,
              consecutiveEmptyPages: feedEmptyPageStreakRef.current,
              maxEmptyPages: 2
            });
            if (
              !page.hasMore ||
              (!page.nextCursor && addedCount === 0) ||
              stopUnchanged ||
              shouldHaltEmptyPageLoop(feedEmptyPageStreakRef.current, 2)
            ) {
              feedNextCursorRef.current = null;
              setFeedNextCursor(null);
              feedOffsetFallbackRef.current = false;
              setFeedOffsetFallbackEnabled(false);
              feedTerminalRef.current = true;
              setFeedTerminal(true);
            } else {
              feedNextCursorRef.current = page.nextCursor;
              setFeedNextCursor(page.nextCursor);
              feedOffsetFallbackRef.current = false;
              setFeedOffsetFallbackEnabled(false);
              feedTerminalRef.current = false;
              setFeedTerminal(false);
            }
            logFeedLifecycle({
              surface: 'member_home',
              transport: 'orchestrated',
              kind: 'load_more',
              sequence: feedLoadRequestIdRef.current,
              cursor,
              nextCursor: page.nextCursor,
              itemCount: appendedItems.length,
              hasMore: page.hasMore,
              feedCountAfter: feedItemsRef.current.length
            });
            return;
          }
          // Soft-fail → drop to Phase 1 for remaining pages; stick for session.
          feedOrchestratedFailedRef.current = true;
          feedTransportRef.current = resolveTransportAfterFailure(feedTransportRef.current, 'orchestrated');
        } catch (orchestratedMoreError) {
          console.warn('Orchestrated load-more failed; falling back to Phase 1', orchestratedMoreError);
          feedOrchestratedFailedRef.current = true;
          feedTransportRef.current = resolveTransportAfterFailure(feedTransportRef.current, 'orchestrated');
        }
      }

      let response: any = null;
      let appendedItems: FeedPost[] = [];

      if (canUseDiscoverySupplement) {
        feedDiscoveryUsedRef.current = true;
        try {
          const discoveryMode =
            (resolvedMode as any) ||
            (showIntentModes ? defaultIntentFeedTab : 'for_you') ||
            'for_you';
          const discovery = await Phase2Service.getDiscoveryFeed({
            mode: String(discoveryMode).toLowerCase() === 'latest' ? 'for_you' : (discoveryMode as any),
            limit: maxFeedItems
          });
          const discoveryPosts = (Array.isArray(discovery?.items) ? discovery.items : [])
            .filter((item: any) => String(item?.type || '').toLowerCase() === 'post' && item?.id)
            .map((item: any) => {
              try {
                return normalizePost({
                  id: item.id,
                  title: item.title,
                  content: item.description || item.title,
                  author: item.author,
                  ranking: {
                    score: Number(item.score || 0),
                    primaryReason: Array.isArray(item.why) ? item.why[0] : 'Recommended for you',
                    reasons: item.why || []
                  },
                  createdAt: item.createdAt || item.created_at || new Date().toISOString()
                });
              } catch {
                return null;
              }
            })
            .filter((item): item is FeedPost => Boolean(item));
          appendedItems = discoveryPosts;
          // Refresh job/gig inject pools from discovery so mixed cards keep flowing.
          const discoveryJobs = (Array.isArray(discovery?.items) ? discovery.items : [])
            .filter((item: any) => String(item?.type || '').toLowerCase() === 'job' && item?.id)
            .map((item: any) => ({
              id: item.id,
              title: item.title,
              description: item.description,
              budget: item.metrics?.budget || item.budget,
              ...item
            }));
          const discoveryGigs = (Array.isArray(discovery?.items) ? discovery.items : [])
            .filter((item: any) => String(item?.type || '').toLowerCase() === 'gig' && item?.id)
            .map((item: any) => ({
              id: item.id,
              title: item.title,
              description: item.description,
              price: item.metrics?.price || item.price,
              ...item
            }));
          if (discoveryJobs.length) {
            setListingJobsPool((prev) => dedupeById([...(prev || []), ...discoveryJobs] as any));
          }
          if (discoveryGigs.length) {
            setListingGigsPool((prev) => dedupeById([...(prev || []), ...discoveryGigs] as any));
          }
        } catch (discoveryError) {
          console.warn('Member-home discovery supplement failed', discoveryError);
          appendedItems = [];
        }
      } else {
        response = canUseOffsetFallback
          ? await CommunityService.getPosts({ limit: maxFeedItems, offset: feedItemsRef.current.length })
          : await CommunityService.getFeed(payload);
        appendedItems = (Array.isArray(extractFeedItems(response)) ? extractFeedItems(response) : [])
          .map((item) => {
            try {
              return normalizePost(item);
            } catch (normalizeError) {
              console.warn('Skipping malformed appended desktop feed post', normalizeError, item);
              return null;
            }
          })
          .filter((item): item is FeedPost => Boolean(item));
      }

      const { addedCount } = appendFeedItems(appendedItems);
      if (addedCount > 0) feedEmptyPageStreakRef.current = 0;
      else feedEmptyPageStreakRef.current += 1;
      feedLastCompletedCursorRef.current = cursor || null;
      feedLastCompletedAddedRef.current = addedCount;

      const nextCursor =
        canUseOffsetFallback || canUseDiscoverySupplement ? null : extractFeedCursor(response);
      const hasMoreFlag =
        canUseOffsetFallback || canUseDiscoverySupplement ? null : extractHasMore(response);
      const offsetEnabled =
        shouldContinueOffsetFallback({
          usedOffsetFallback: canUseOffsetFallback,
          nextCursor,
          pageItemCount: appendedItems.length,
          pageSize: maxFeedItems,
          uniqueAddedCount: addedCount
        }) &&
        scope === 'discover' &&
        !feedTopic &&
        !feedRegion;

      const terminal = resolveFeedTerminalState({
        nextCursor,
        hasMoreFlag,
        uniqueAddedCount: addedCount,
        offsetFallbackEnabled: offsetEnabled,
        secondarySourcesRemaining: !feedDiscoveryUsedRef.current && scope === 'discover'
      });
      const stopUnchanged = shouldStopUnchangedCursorLoop({
        requestedCursor: cursor,
        returnedCursor: nextCursor,
        uniqueAddedCount: addedCount,
        consecutiveEmptyPages: feedEmptyPageStreakRef.current,
        maxEmptyPages: 2
      });

      if (shouldHaltEmptyPageLoop(feedEmptyPageStreakRef.current, 2) || terminal.isTerminal || stopUnchanged) {
        feedNextCursorRef.current = null;
        setFeedNextCursor(null);
        feedOffsetFallbackRef.current = false;
        setFeedOffsetFallbackEnabled(false);
        feedTerminalRef.current = true;
        setFeedTerminal(true);
      } else {
        feedNextCursorRef.current = nextCursor;
        setFeedNextCursor(nextCursor);
        feedOffsetFallbackRef.current = offsetEnabled;
        setFeedOffsetFallbackEnabled(offsetEnabled);
        feedTerminalRef.current = false;
        setFeedTerminal(false);
      }
      logFeedLifecycle({
        surface: 'member_home',
        transport: feedTransportRef.current,
        kind: 'load_more',
        sequence: feedLoadRequestIdRef.current,
        cursor: cursor || null,
        nextCursor,
        itemCount: appendedItems.length,
        hasMore: !terminal.isTerminal,
        feedCountAfter: feedItemsRef.current.length
      });
    } catch (error) {
      // Keep cursor/offset so IntersectionObserver can retry without full reload.
      console.error('Failed to load more home feed', error);
    } finally {
      feedLoadingMoreRef.current = false;
      feedInFlightCursorRef.current = null;
      setFeedLoadingMore(false);
    }
  }, [
    appendFeedItems,
    defaultIntentFeedTab,
    desktopConstrainedFeed,
    extractFeedCursor,
    extractFeedItems,
    feedRegion,
    feedTab,
    feedTopic,
    maxFeedItems,
    normalizePost,
    showCategoriesFilter,
    showIntentModes,
    user
  ]);

  const extractMarketplacePreviewListings = useCallback((value: any): MarketplaceListing[] => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.listings)) return value.listings;
    if (Array.isArray(value?.items)) return value.items;
    return [];
  }, []);

  const extractGroupPreviewRecommendations = useCallback((value: any): CommunityClub[] => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.groups)) return value.groups;
    if (Array.isArray(value?.clubs)) return value.clubs;
    if (Array.isArray(value?.items)) return value.items;
    return [];
  }, []);

  const loadSidebar = useCallback(async () => {
    if (!user) return;
    setViewersLoading(true);
    setMarketplacePreviewLoading(true);
    setGroupPreviewLoading(true);
    try {
      const tasks: Promise<any>[] = [];
      tasks.push(
        showProfiles
          ? Promise.allSettled([
              RecoService.getAccounts({
                surface: 'who_to_follow',
                type: 'freelancer',
                limit: Math.max(3, maxProfiles)
              }),
              RecoService.getAccounts({
                surface: 'who_to_follow',
                type: 'client',
                limit: Math.max(2, Math.ceil(maxProfiles / 2))
              })
            ]).then((results) => {
              const freelancerItems =
                results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : [];
              const clientItems =
                results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : [];
              const merged = [...freelancerItems, ...clientItems];
              if (merged.length) return merged;
              return CommunityService.getTopContributors(maxProfiles);
            })
          : Promise.resolve([])
      );
      tasks.push(
        (showJobs || showEmployers)
          ? Promise.allSettled([
              jobsApi.getJobs({ status: 'active', limit: listingPoolLimit, featuredOnly: true }),
              jobsApi.getJobs({ status: 'active', limit: listingPoolLimit, recommended: true }),
              jobsApi.getJobs({ status: 'active', limit: listingPoolLimit, random: true })
            ])
          : Promise.resolve([])
      );
      tasks.push(
        (showGigs || showFreelancers)
          ? Promise.allSettled([
              gigsApi.getGigs({ status: 'active', limit: listingPoolLimit, featuredOnly: true }),
              gigsApi.getGigs({ status: 'active', limit: listingPoolLimit, recommended: true }),
              gigsApi.getGigs({ status: 'active', limit: listingPoolLimit, random: true })
            ])
          : Promise.resolve([])
      );
      tasks.push(showProfileViewers ? UserService.getProfileViewers(user.id, maxProfileViewers) : Promise.resolve({ viewers: [] }));
      tasks.push(showProfileViewing ? UserService.getProfilesViewed(user.id, maxProfileViewing) : Promise.resolve({ viewed: [] }));
      tasks.push(
        showPagesRecommendations
          ? RecoService.getAccounts({
              surface: 'member_home',
              type: 'page',
              limit: maxPagesRecommendations
            }).catch(() => CommunityService.getRecommendedBusinessPages(maxPagesRecommendations))
          : Promise.resolve([])
      );
      tasks.push(
        showSidebarAds || showFeaturedSidebarAd
          ? Promise.allSettled([
              CommunityService.getPublicAds({ placement: 'homepage', limit: 6 }),
              CommunityService.getPublicAds({ placement: 'homepage_feed', limit: 8 }),
              CommunityService.getPublicAds({ placement: 'community_feed', limit: 8 }),
              CommunityService.getPublicAds({ limit: 10 })
            ]).then((results) => {
              const merged: any[] = [];
              results.forEach((result) => {
                if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                  merged.push(...result.value);
                }
              });
              const seen = new Set<string>();
              return merged.filter((ad) => {
                const id = String(ad?.id || '').trim();
                if (!id || seen.has(id)) return false;
                seen.add(id);
                return true;
              });
            })
          : Promise.resolve([])
      );
      tasks.push(
        showDiscover
          ? CommunityService.getClubs({
              limit: 8
            }).catch(() => [])
          : Promise.resolve([])
      );
      tasks.push(
        showDiscover
          ? listMarketplaceListings({
              page: 1,
              pageSize: 4,
              sort: 'recommended'
            }).catch(() => [])
          : Promise.resolve([])
      );

      const [profilesRes, jobsRes, gigsRes, viewersRes, viewingRes, pagesRes, adsRes, groupsRes, marketplaceRes] =
        await Promise.allSettled(tasks);

      const nextProfiles = profilesRes.status === 'fulfilled' && Array.isArray(profilesRes.value)
        ? profilesRes.value.slice(0, maxProfiles).map((p: any) => {
            const intel = resolvePersonRecoPresentation(p);
            return {
              id: (p?.account?.id || p?.entityId || p?.id || p?.userId || p?.user_id || '').toString(),
              name: p?.account?.name || p?.name || p?.userName || 'Community member',
              subtitle:
                p?.account?.headline ||
                p?.account?.category ||
                p?.title ||
                p?.bio ||
                p?.tagline ||
                'Recommended profile',
              avatar: p?.account?.avatar || p?.avatar || p?.userAvatar,
              username: p?.account?.username || p?.username || p?.user_name || p?.userName || '',
              entityType: (String(p?.entityType || p?.account?.entityType || '').toLowerCase() === 'client' ||
              String(p?.entityType || p?.account?.entityType || '').toLowerCase() === 'employer'
                ? 'client'
                : 'freelancer') as 'freelancer' | 'client',
              reasons: intel.reasons,
              whyRecommended: intel.whyRecommended,
              badge: intel.badge
            };
          })
        : [];

      const viewersList =
        viewersRes?.status === 'fulfilled' && Array.isArray((viewersRes.value as any)?.viewers)
          ? (viewersRes.value as any).viewers
          : [];
      setProfileViewers(
        viewersList.slice(0, maxProfileViewers).map((viewer: any) => ({
          id: viewer.id || viewer.userId || viewer.user_id,
          name: viewer.name || 'Member',
          subtitle: viewer.title || 'Viewed your profile',
          avatar: viewer.avatar || null,
          username: viewer.username || '',
          viewedAt: viewer.viewed_at || viewer.viewedAt
        }))
      );

      const viewingList =
        viewingRes?.status === 'fulfilled' && Array.isArray((viewingRes.value as any)?.viewed)
          ? (viewingRes.value as any).viewed
          : [];
      setProfileViewing(
        viewingList.slice(0, maxProfileViewing).map((entry: any) => ({
          id: entry.id || entry.userId || entry.user_id,
          name: entry.name || 'Member',
          subtitle: entry.title || 'Profile viewed',
          avatar: entry.avatar || null,
          username: entry.username || '',
          viewedAt: entry.viewed_at || entry.viewedAt
        }))
      );

      let rawJobsList = jobsRes.status === 'fulfilled'
        ? mergeSettledResponses<Job & { id?: string | null }>(jobsRes.value, extractJobsFromPayload)
        : [];
      if (rawJobsList.length === 0 && (showJobs || showEmployers)) {
        try {
          const fallbackJobs = await jobsApi.getJobs({ status: 'active', limit: listingPoolLimit });
          rawJobsList = extractJobsFromPayload(fallbackJobs);
        } catch (jobsFallbackError) {
          console.warn('Failed to load desktop jobs fallback', jobsFallbackError);
        }
      }
      const jobsList = shuffleArray(
        dedupeById((rawJobsList || []) as Array<Job & { id: string }>)
      );
      setListingJobsPool((prev) => (jobsList.length === 0 && prev.length ? prev : jobsList.slice(0, listingPoolLimit)));
      setJobs((prev) => (jobsList.length === 0 && prev.length ? prev : jobsList.slice(0, maxJobs)));

      let rawGigsList = gigsRes.status === 'fulfilled'
        ? mergeSettledResponses<Gig & { id?: string | null }>(gigsRes.value, extractGigsFromPayload)
        : [];
      if (rawGigsList.length === 0 && (showGigs || showFreelancers)) {
        try {
          const fallbackGigs = await gigsApi.getGigs({ status: 'active', limit: listingPoolLimit });
          rawGigsList = extractGigsFromPayload(fallbackGigs);
        } catch (gigsFallbackError) {
          console.warn('Failed to load desktop gigs fallback', gigsFallbackError);
        }
      }
      const gigsList = shuffleArray(
        dedupeById((rawGigsList || []) as Array<Gig & { id: string }>)
      );
      setListingGigsPool((prev) => (gigsList.length === 0 && prev.length ? prev : gigsList.slice(0, listingPoolLimit)));
      setGigs((prev) => (gigsList.length === 0 && prev.length ? prev : gigsList.slice(0, maxGigs)));

      const employerMap = new Map<string, ProfileCard>();
      jobsList.forEach((job: Job) => {
        if (!job.clientId) return;
        if (employerMap.has(job.clientId)) return;
        employerMap.set(job.clientId, {
          id: job.clientId,
          name: job.clientName || 'Employer',
          subtitle: job.category || 'Hiring now',
          avatar: job.clientAvatar || null,
          username: (job as any).clientUsername || (job as any).client_user_name || ''
        });
      });
      setEmployers(Array.from(employerMap.values()).slice(0, maxProfiles));

      const freelancerMap = new Map<string, ProfileCard>();
      gigsList.forEach((gig: any) => {
        if (!gig.freelancerId) return;
        if (freelancerMap.has(gig.freelancerId)) return;
        freelancerMap.set(gig.freelancerId, {
          id: gig.freelancerId,
          name: gig.freelancerName || 'Freelancer',
          subtitle: gig.category || 'Open to work',
          avatar: gig.freelancerAvatar || null,
          username: (gig as any).freelancerUsername || (gig as any).freelancer_user_name || ''
        });
      });
      setFreelancers(Array.from(freelancerMap.values()).slice(0, maxProfiles));
      const fallbackProfiles = Array.from(
        new Map<string, ProfileCard>(
          [...employerMap.values(), ...freelancerMap.values()].map((profile) => [profile.id, profile])
        ).values()
      ).slice(0, maxProfiles);
      setProfiles(nextProfiles.length ? nextProfiles : fallbackProfiles);

      const nextPages =
        pagesRes.status === 'fulfilled' && Array.isArray(pagesRes.value)
          ? pagesRes.value
              .map((page: any) => normalizeRecommendedPage(page))
              .filter(Boolean)
              .slice(0, maxPagesRecommendations) as RecommendedPageCard[]
          : [];
      setRecommendedPages(nextPages);

      const normalizedAds =
        adsRes.status === 'fulfilled' && Array.isArray(adsRes.value)
          ? shuffleArray(
              adsRes.value
                .map((ad: any) => normalizeSidebarAd(ad))
                .filter(Boolean) as SidebarAdCard[]
            )
          : [];
      let sidebarAdCursor = 0;
      const topAd = showTopSidebarAd ? (normalizedAds[sidebarAdCursor++] || null) : null;
      const featuredAd = showFeaturedSidebarAd ? (normalizedAds[sidebarAdCursor++] || null) : null;
      const middleAd = showMiddleSidebarAd ? (normalizedAds[sidebarAdCursor++] || null) : null;
      setSidebarTopAd(topAd);
      setSidebarFeaturedAd(featuredAd);
      setSidebarMiddleAd(middleAd);
      setGroupPreviewRecommendations(
        groupsRes.status === 'fulfilled'
          ? extractGroupPreviewRecommendations(groupsRes.value)
              .filter((group) => String(group?.id || '').trim())
              .filter((group) => String(group?.status || 'active').toLowerCase() === 'active')
              .filter((group) => !group.isJoined && !group.is_joined)
              .sort(
                (left, right) =>
                  Number(Boolean(right.pendingInvite)) - Number(Boolean(left.pendingInvite)) ||
                  Number(right.memberCount ?? right.member_count ?? 0) - Number(left.memberCount ?? left.member_count ?? 0)
              )
              .slice(0, 3)
          : []
      );
      setMarketplacePreviewListings(
        marketplaceRes.status === 'fulfilled'
          ? extractMarketplacePreviewListings(marketplaceRes.value).slice(0, 3)
          : []
      );
    } catch (error) {
      console.error('Failed to load member home sidebar data', error);
    } finally {
      setViewersLoading(false);
      setMarketplacePreviewLoading(false);
      setGroupPreviewLoading(false);
    }
  }, [
    user,
    showProfiles,
    showPagesRecommendations,
    showProfileViewers,
    showProfileViewing,
    showJobs,
    showEmployers,
    showGigs,
    showFreelancers,
    maxProfiles,
    maxPagesRecommendations,
    maxProfileViewers,
    maxProfileViewing,
    maxJobs,
    maxGigs,
    listingPoolLimit,
    showSidebarAds,
    showTopSidebarAd,
    showFeaturedSidebarAd,
    showMiddleSidebarAd,
    showDiscover,
    extractGroupPreviewRecommendations,
    extractMarketplacePreviewListings,
    normalizeSidebarAd,
    normalizeRecommendedPage
  ]);

  const scheduleSidebarRefresh = useCallback(() => {
    if (sidebarRefreshTimeoutRef.current) {
      window.clearTimeout(sidebarRefreshTimeoutRef.current);
    }
    sidebarRefreshTimeoutRef.current = window.setTimeout(() => {
      loadSidebar();
    }, 120);
  }, [loadSidebar]);

  const buildGroupRecommendationPath = useCallback((group: CommunityClub) => {
    const reference = String(group.slug || group.id || '').trim();
    if (!reference) return '/community/clubs';
    const search = new URLSearchParams();
    search.set('group', reference);
    return `/community/clubs?${search.toString()}`;
  }, []);

  const handleJoinGroupRecommendation = useCallback(
    async (group: CommunityClub) => {
      const groupId = String(group.id || '').trim();
      if (!groupId) return;
      if (!user) {
        showNotification('warning', 'Groups', 'Please sign in to join groups.');
        return;
      }

      const isPrivate = String(group.visibility || 'public').toLowerCase() === 'private';
      const joinMode = String(group.joinMode || 'open').toLowerCase();
      const requiresApproval = joinMode === 'request' || isPrivate;
      const inviteOnly = joinMode === 'invite_only';

      if (inviteOnly && !group.pendingInvite) {
        showNotification('warning', 'Groups', `${group.name} accepts members by invite only.`);
        return;
      }

      setGroupJoinBusy((current) => ({ ...current, [groupId]: true }));
      try {
        if (requiresApproval && !group.pendingInvite) {
          const response = await CommunityService.requestToJoinClub(groupId);
          if (response.pending) {
            showNotification('success', 'Groups', `Your request to join ${group.name} is awaiting review.`);
            setGroupPreviewRecommendations((current) =>
              current.map((entry) =>
                entry.id === groupId
                  ? {
                      ...entry,
                      pendingRequest: response.request || {
                        id: `pending-${groupId}`,
                        status: 'pending'
                      }
                    }
                  : entry
              )
            );
          } else {
            showNotification('success', 'Groups', `Join request sent to ${group.name}.`);
          }
        } else {
          await CommunityService.joinClub(groupId);
          showNotification('success', 'Groups', `You joined ${group.name}.`);
          setGroupPreviewRecommendations((current) => current.filter((entry) => entry.id !== groupId));
        }
        scheduleSidebarRefresh();
      } catch (error: any) {
        showNotification('error', 'Groups', error?.message || 'Unable to join this group.');
      } finally {
        setGroupJoinBusy((current) => ({ ...current, [groupId]: false }));
      }
    },
    [scheduleSidebarRefresh, showNotification, user]
  );

  useEffect(() => {
    if (!user || !showDiscover) {
      setFeaturedSeries([]);
      setBroadcastChannels([]);
      setOfficeHours([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.allSettled([ScrollService.getDiscoverableSeries(3), CommunityService.getBroadcastChannels(3), CommunityService.getEvents()])
        .then(([seriesResult, channelsResult, eventsResult]) => {
          if (cancelled) return;
          setFeaturedSeries(
            seriesResult.status === 'fulfilled' && Array.isArray(seriesResult.value) ? seriesResult.value.slice(0, 3) : []
          );
          setBroadcastChannels(
            channelsResult.status === 'fulfilled' && Array.isArray(channelsResult.value) ? channelsResult.value.slice(0, 3) : []
          );
          setOfficeHours(
            eventsResult.status === 'fulfilled'
              ? getHighlightedCommunityEvents(Array.isArray(eventsResult.value) ? eventsResult.value : [], 2)
              : []
          );
        })
        .catch(() => {
          if (cancelled) return;
          setFeaturedSeries([]);
          setBroadcastChannels([]);
          setOfficeHours([]);
        });
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [showDiscover, user]);

  const loadStories = useCallback(async () => {
    if (!user || !showStories) return;
    setStoriesLoading(true);
    try {
      const feed = await CommunityService.getStoriesFeed();
      const list = Array.isArray(feed) ? feed : [];
      const nextStories = await hydrateStoryAuthorAvatars(filterActiveStories(list).slice(0, maxStories), user);
      setStories((prev) => {
        return nextStories.length === 0 && prev.length ? prev : nextStories;
      });
    } catch (error) {
      console.error('Failed to load stories', error);
    } finally {
      setStoriesLoading(false);
    }
  }, [user, showStories, maxStories, filterActiveStories]);

  const loadReels = useCallback(async () => {
    if (!user || !showStories) return;
    setReelsLoading(true);
    try {
      const feed = await ScrollService.getFeed({ limit: maxReels });
      const nextReels = Array.isArray(feed?.items)
        ? feed.items.filter((item) => String(item?.status || '').toUpperCase() !== 'REMOVED').slice(0, maxReels)
        : [];
      if (nextReels.length === 0 && reelsRef.current.length > 0) {
        setScrollConfig(feed?.config || null);
        return;
      }
      setScrollConfig(feed?.config || null);
      setReels(nextReels);
    } catch (error) {
      console.error('Failed to load reels', error);
      if (!reelsRef.current.length) {
        setScrollConfig(null);
        setReels([]);
      }
    } finally {
      setReelsLoading(false);
    }
  }, [user, showStories, maxReels]);

  const loadMessages = useCallback(async () => {
    if (!user || !showMessages) return;
    setMessagesLoading(true);
    try {
      const list = await MessagingService.getAllConversations(user.id, user.role as any);
      setConversations(Array.isArray(list) ? list.slice(0, maxMessages) : []);
    } catch (error) {
      console.error('Failed to load messages', error);
      setConversations([]);
    } finally {
      setMessagesLoading(false);
    }
  }, [user, showMessages, maxMessages]);

  useEffect(() => {
    if (!user?.id) {
      resetFollowState();
      setFollowingIds(new Set());
      setFollowingMap({});
      return;
    }
    let active = true;
    const loadFollowing = async () => {
      try {
        const data = await CommunityService.listFollowing('me');
        if (!active) return;
        const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
        const nextIds = new Set<string>();
        const nextMap: Record<string, { followId?: string }> = {};
        users.forEach((entry: any) => {
          const id = String(entry.id || entry.userId || entry.user_id || entry.targetId || entry.target_id || '');
          if (!id) return;
          nextIds.add(id);
          nextMap[id] = { followId: entry.followId || entry.follow_id };
        });
        setFollowingIds(nextIds);
        setFollowingMap(nextMap);
        if (nextIds.size) {
          const seeded: Record<string, boolean> = {};
          nextIds.forEach((id) => {
            seeded[id] = true;
          });
          setFollowStatuses(seeded);
        }
      } catch (error) {
        if (active) {
          setFollowingIds(new Set());
          setFollowingMap({});
        }
      }
    };
    loadFollowing();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const loadSlider = useCallback(async () => {
    if (!showSlider) return;
    if (content?.sliderItems?.length) {
      setSliderItems(content.sliderItems);
      return;
    }
    try {
      const homepage = await CommunityService.getCommunityHomepage();
      const items = Array.isArray(homepage?.sliders) ? homepage.sliders : [];
      setSliderItems(items);
    } catch (error) {
      console.error('Failed to load slider items', error);
      setSliderItems([]);
    }
  }, [showSlider, content?.sliderItems]);

  const normalizeSearchType = useCallback((value: any): SearchGroupKey | undefined => {
    const key = String(value || '').trim().toLowerCase();
    if (!key) return undefined;
    if (key === 'people' || key === 'person' || key === 'users' || key === 'user') return 'people';
    if (key === 'pages' || key === 'page') return 'pages';
    if (key === 'jobs' || key === 'job') return 'jobs';
    if (key === 'gigs' || key === 'gig') return 'gigs';
    if (key === 'marketplace' || key === 'marketplace_listing' || key === 'listing' || key === 'product' || key === 'item') return 'marketplace';
    if (key === 'posts' || key === 'post') return 'posts';
    return undefined;
  }, []);

  const normalizeSearchItem = useCallback((item: any): SearchResultItem => {
    const normalizedType = normalizeSearchType(item.type || item.kind || item.entityType || item.category);
    const title = item.title || item.name || item.username || 'Result';
    const avatar = item.avatarUrl || item.avatar || item.image || item.cover || item.thumbnail || null;
    return {
      id: item.id || item._id,
      type: normalizedType || item.type || item.kind || item.category,
      title,
      name: item.name || item.title || undefined,
      username: item.username || item.handle || item.meta?.username || undefined,
      subtitle: item.subtitle || undefined,
      description: item.description || item.excerpt || item.summary || item.subtitle,
      excerpt: item.excerpt,
      url: resolveSearchItemUrl(item, normalizedType),
      avatarUrl: avatar,
      image: avatar || undefined,
      category: item.category,
      meta: item.meta || {}
    };
  }, [normalizeSearchType, resolveSearchItemUrl]);

  const normalizeMarketplaceSearchItem = useCallback((listing: MarketplaceListing): SearchResultItem => {
    const categoryName = String(listing?.category?.name || '').trim();
    const location = String(listing?.location || '').trim();
    const price = listing?.price !== undefined && listing?.price !== null && listing.price !== ''
      ? `${listing.currency || 'USD'} ${listing.price}`
      : '';
    const subtitle = [price, categoryName, location].filter(Boolean).join(' - ');
    const image =
      listing.coverImage ||
      (Array.isArray(listing.images) && listing.images.length
        ? (typeof listing.images[0] === 'string' ? listing.images[0] : listing.images[0]?.url)
        : null) ||
      null;
    return {
      id: listing.id,
      type: 'marketplace',
      title: listing.title || 'Marketplace item',
      subtitle: subtitle || 'Marketplace listing',
      description: listing.description || undefined,
      url: `/marketplace/listing/${encodeURIComponent(listing.slug || listing.id)}`,
      avatarUrl: image,
      image: image || undefined,
      category: categoryName || 'Marketplace',
      meta: {
        price: listing.price,
        currency: listing.currency,
        brand: listing.brand,
        location: listing.location
      }
    };
  }, []);

  const resolveMarketplaceListingUrl = useCallback((listing: MarketplaceListing) => {
    const slugOrId = String(listing?.slug || listing?.id || '').trim();
    return slugOrId ? `/marketplace/listing/${encodeURIComponent(slugOrId)}` : '/marketplace';
  }, []);

  const normalizeSearchGroups = useCallback((groups: any): SearchGroupMap => {
    const next = emptySearchGroups();
    SEARCH_GROUP_ORDER.forEach((key) => {
      const list = Array.isArray(groups?.[key]) ? groups[key] : [];
      next[key] = list.map(normalizeSearchItem).filter((entry) => Boolean(entry?.url));
    });
    return next;
  }, [normalizeSearchItem]);

  const searchSections = useMemo(
    () =>
      SEARCH_GROUP_ORDER.map((key) => ({
        key,
        label: SEARCH_GROUP_LABELS[key],
        items: searchGroups[key] || []
      })).filter((section) => section.items.length > 0),
    [searchGroups]
  );

  const searchRecommendationPrompts = useMemo(() => {
    const clean = searchQuery.trim();
    if (clean.length >= 2) {
      const encoded = encodeURIComponent(clean);
      return [
        { label: `Search all Scrolith for "${clean}"`, url: `/search?q=${encoded}` },
        { label: `Marketplace items matching "${clean}"`, url: `/marketplace?search=${encoded}` },
        { label: `People matching "${clean}"`, url: `/search?q=${encoded}&type=people` },
        { label: `Posts mentioning "${clean}"`, url: `/search?q=${encoded}&type=posts` },
        { label: `Pages related to "${clean}"`, url: `/search?q=${encoded}&type=pages` }
      ];
    }
    return MEMBER_HOME_SEARCH_PROMPTS.map((label) => ({
      label,
      url: `/search?q=${encodeURIComponent(label)}`
    }));
  }, [searchQuery]);

  const performSearch = useCallback(async (term: string) => {
    const clean = term.trim();
    if (!clean) {
      searchRequestRef.current += 1;
      setSearchResults([]);
      setSearchGroups(emptySearchGroups());
      setSearchLoading(false);
      return;
    }
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setSearchLoading(true);
    try {
      const perType = Math.max(2, Math.min(6, Math.ceil(maxSearchResults / 2)));
      const [unified, posts, marketplaceResponse] = await Promise.all([
        SearchService.searchUnified(clean, {
          limit: Math.max(maxSearchResults, 12),
          perType
        }),
        SearchService.search(clean, { type: 'posts', limit: Math.max(4, Math.min(8, maxSearchResults)) }).catch(() => []),
        listMarketplaceListings({
          search: clean,
          page: 1,
          pageSize: Math.max(4, Math.min(8, maxSearchResults)),
          sort: 'recommended'
        }).catch(() => null)
      ]);
      const marketplaceListings = Array.isArray(marketplaceResponse)
        ? marketplaceResponse
        : Array.isArray((marketplaceResponse as any)?.listings)
          ? (marketplaceResponse as any).listings
          : Array.isArray((marketplaceResponse as any)?.items)
            ? (marketplaceResponse as any).items
            : [];
      const marketplaceItems = marketplaceListings.map(normalizeMarketplaceSearchItem);
      const groups = normalizeSearchGroups({
        ...(unified.groups || {}),
        posts: Array.isArray((unified.groups as any)?.posts) && (unified.groups as any).posts.length
          ? (unified.groups as any).posts
          : posts,
        marketplace: marketplaceItems
      });
      const merged = Array.isArray(unified.results) && unified.results.length
        ? [...unified.results, ...(posts || [])].map(normalizeSearchItem).concat(marketplaceItems)
        : SEARCH_GROUP_ORDER.flatMap((key) => groups[key]);
      const unique = Array.from(
        new Map(
          merged
            .filter((item) => Boolean(item?.url))
            .map((item, index) => [
              item.id ? `${item.type || 'result'}:${item.id}` : `${item.type || 'result'}:${item.url || ''}:${index}`,
              item
            ])
        ).values()
      );
      if (searchRequestRef.current !== requestId) return;
      setSearchGroups(groups);
      setSearchResults(unique.slice(0, maxSearchResults));
      if (user?.id) {
        SearchService.saveSearchHistory(user.id, clean).catch(() => {});
      }
    } catch (error) {
      if (searchRequestRef.current !== requestId) return;
      console.error('Search failed', error);
      setSearchResults([]);
      setSearchGroups(emptySearchGroups());
    } finally {
      if (searchRequestRef.current === requestId) {
        setSearchLoading(false);
      }
    }
  }, [maxSearchResults, normalizeMarketplaceSearchItem, normalizeSearchGroups, normalizeSearchItem, user?.id]);

  useEffect(() => {
    if (!currentUserId) {
      setSelfProfileCover('');
      return;
    }
    let active = true;
    // Match FreelancerProfile/EditProfile: resolve cover from the same fields and
    // prefer a stable content URL (no OptimizedImage transform query params).
    const resolveCoverCandidate = (source: any) => {
      if (!source) return '';
      const raw =
        source?.coverPhotoUrl ||
        source?.cover_photo_url ||
        source?.coverUrl ||
        source?.cover_url ||
        '';
      const fileId =
        source?.coverFileId ||
        source?.cover_file_id ||
        source?.coverPhotoFileId ||
        source?.cover_photo_file_id ||
        '';
      return (
        resolvePostAttachmentMediaUrl({
          url: raw,
          fileId,
          path: source?.cover?.path || source?.cover?.url
        }) ||
        resolvePostAttachmentMediaUrl(source?.cover) ||
        (raw ? resolveAssetUrl(String(raw)) : '') ||
        ''
      );
    };
    const fallbackCover = resolveCoverCandidate(user);
    const loadSelfCover = async () => {
      try {
        // Prefer /profile/me for the signed-in owner (same source as dashboard profile).
        let profile: any = null;
        try {
          profile = await UserService.getMyProfile();
        } catch {
          profile = await UserService.getProfile(currentUserId);
        }
        if (!active) return;
        const resolved = resolveCoverCandidate(profile) || fallbackCover;
        setSelfProfileCover(resolved);
      } catch {
        if (active) setSelfProfileCover(fallbackCover);
      }
    };
    loadSelfCover();
    return () => {
      active = false;
    };
  }, [currentUserId, user]);

  useEffect(() => {
    if (!showSearch) return;
    const term = searchQuery.trim();
    if (term.length < 2) {
      searchRequestRef.current += 1;
      setSearchResults([]);
      setSearchGroups(emptySearchGroups());
      setSearchLoading(false);
      return;
    }
    const id = window.setTimeout(() => {
      performSearch(term);
    }, 350);
    return () => window.clearTimeout(id);
  }, [performSearch, searchQuery, showSearch]);

  useEffect(() => {
    if (!searchOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [searchOpen]);

  const updatePostMedia = useCallback((localId: string, patch: Partial<PostMediaItem>) => {
    setPostDraft((prev) => ({
      ...prev,
      media: prev.media.map((item) => {
        if (item.localId !== localId) return item;
        // Revoke blob preview when swapping to a durable URL.
        if (patch.url && patch.url !== item.url && String(item.url || '').startsWith('blob:')) {
          revokePreviewUrl(item.url);
        }
        return { ...item, ...patch };
      })
    }));
  }, []);

  const addPostMediaItem = useCallback((item: PostMediaItem) => {
    setPostDraft((prev) => ({ ...prev, media: [...prev.media, item] }));
  }, []);

  const handlePostMediaRemove = useCallback((localId: string) => {
    setPostDraft((prev) => {
      const target = prev.media.find((item) => item.localId === localId);
      if (!target) return prev;
      if (target.url) revokePreviewUrl(target.url);
      const nextMedia = prev.media.filter((item) => item.localId !== localId);
      postMediaCountRef.current = nextMedia.length;
      postMediaItemsRef.current = nextMedia;
      return {
        ...prev,
        media: nextMedia
      };
    });
    setComposerStatusMessage('Attachment removed.');
  }, []);

  const uploadPostFile = useCallback(async (file: File) => {
    if (!user) return;
    const validation = validateComposerFile(file, {
      currentCount: postMediaCountRef.current
    });
    if (!validation.ok) {
      showNotification('warning', 'Attachments', validation.reason);
      setComposerStatusMessage(validation.reason);
      return;
    }
    // Reserve a slot immediately so concurrent multi-file picks cannot exceed the limit.
    postMediaCountRef.current += 1;
    const localId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const inferred = validation.kind;
    const previewUrl = URL.createObjectURL(file);
    addPostMediaItem({
      localId,
      url: previewUrl,
      name: file.name,
      type: inferred,
      uploading: true,
      progress: 0
    });
    setComposerStatusMessage(`Uploading ${file.name}…`);
    try {
      const uploaded = await FileService.uploadFile(file, 'community', {
        role: user.role,
        visibility: postDraft.visibility === 'private' ? 'private' : 'public',
        userId: user.id,
        onProgress: (percent) => {
          updatePostMedia(localId, { progress: percent });
          setComposerStatusMessage(`Uploading ${file.name}: ${percent}%`);
        }
      });
      updatePostMedia(localId, {
        id: uploaded.id,
        url: uploaded.url,
        type: uploaded.type === 'video' ? 'video' : uploaded.type === 'image' ? 'image' : 'document',
        mimeType: uploaded.mimeType || uploaded.mime_type,
        thumbnailUrl: uploaded.thumbnailUrl || uploaded.thumbnail_url,
        duration: uploaded.duration,
        uploading: false,
        progress: 100,
        error: undefined
      });
      setComposerStatusMessage(`${file.name} uploaded.`);
    } catch (error: any) {
      console.error('Upload failed', error);
      const message = error?.message || 'Upload failed';
      updatePostMedia(localId, { uploading: false, error: message });
      setComposerStatusMessage(`${file.name} failed: ${message}`);
    }
  }, [addPostMediaItem, postDraft.visibility, showNotification, updatePostMedia, user]);

  const handlePostMedia = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    files.forEach((file) => {
      void uploadPostFile(file);
    });
    if (postMediaInputRef.current) postMediaInputRef.current.value = '';
  }, [uploadPostFile]);

  const handleComposerDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const files = Array.from(event.dataTransfer?.files || []);
      if (!files.length) return;
      files.forEach((file) => {
        void uploadPostFile(file);
      });
    },
    [uploadPostFile]
  );

  const handleComposerPaste = useCallback(
    (event: React.ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items || []);
      const imageItems = items.filter((item) => item.kind === 'file' && String(item.type || '').startsWith('image/'));
      if (!imageItems.length) return;
      event.preventDefault();
      imageItems.forEach((item) => {
        const file = item.getAsFile();
        if (file) void uploadPostFile(file);
      });
    },
    [uploadPostFile]
  );

  const startCamera = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      postCameraInputRef.current?.click();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showNotification('warning', 'Camera', 'Camera access is not available in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setCameraStream(stream);
      setCameraOpen(true);
    } catch (error) {
      console.error(error);
      showNotification('error', 'Camera', 'Unable to access camera.');
    }
  }, [showNotification]);

  const stopCamera = useCallback(() => {
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
  }, [cameraStream, isRecording]);

  const capturePhoto = useCallback(() => {
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
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `post-${Date.now()}.png`, { type: blob.type || 'image/png' });
      uploadPostFile(file).finally(() => stopCamera());
    }, 'image/png');
  }, [stopCamera, uploadPostFile]);

  const startRecording = useCallback(() => {
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
      if (event.data && event.data.size > 0) recordedChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
      if (blob.size) {
        const file = new File([blob], `post-${Date.now()}.webm`, { type: blob.type });
        uploadPostFile(file).finally(() => stopCamera());
      } else {
        stopCamera();
      }
      setIsRecording(false);
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }, [cameraStream, isRecording, showNotification, stopCamera, uploadPostFile]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    try {
      mediaRecorderRef.current.stop();
    } catch (e) {
      console.error(e);
    }
  }, []);

  const closeAiSuggestionModal = useCallback(() => {
    setAiSuggestionOpen(false);
    setAiSuggestion('');
    setAiSuggestionMode(null);
    setAiOriginalText('');
    setAiCompareView('compare');
    setAiSuggestionWarning(null);
  }, []);

  const getPostDraftText = useCallback(() => String(postDraft.content || ''), [postDraft.content]);

  const runPostAi = useCallback(
    async (mode: PostEnhanceMode) => {
      const text = getPostDraftText().trim();
      if (!text) {
        showNotification('warning', 'Scrolitha', 'Write some text first, then run Scrolitha enhancement.');
        return;
      }
      if (aiLoading) return;

      setAiLoading(true);
      setAiRunningMode(mode);
      setAiError(null);
      setAiSuggestionWarning(null);
      try {
        const result = await AIService.enhancePostDraft({ text, mode });
        const enhancedText = String(result?.enhancedText || '').trim();
        if (!enhancedText) {
          showNotification('warning', 'Scrolitha', 'No suggestion was returned. Please try again.');
          return;
        }

        setAiOriginalText(text);
        setAiSuggestion(enhancedText);
        setAiSuggestionMode(mode);
        setAiCompareView('compare');
        if (result.fallbackUsed || result.warning) {
          setAiSuggestionWarning(
            result.warning || 'Scrolitha used backup processing for this suggestion. Please review before applying.'
          );
        }
        setAiSuggestionOpen(true);
      } catch (error: any) {
        console.error('Failed to run post AI', error);
        setAiError(error?.message || 'An unknown error occurred');
        showNotification('error', 'Scrolitha', 'Scrolitha could not improve this text right now. Please try again.');
      } finally {
        setAiLoading(false);
        setAiRunningMode(null);
      }
    },
    [aiLoading, getPostDraftText, showNotification]
  );

  const applyAiSuggestionReplace = useCallback(() => {
    if (!aiSuggestion) return;
    setPostDraft((prev) => ({ ...prev, content: aiSuggestion }));
    closeAiSuggestionModal();
  }, [aiSuggestion, closeAiSuggestionModal]);

  const applyAiSuggestionInsert = useCallback(() => {
    if (!aiSuggestion) return;
    setPostDraft((prev) => {
      const base = String(prev.content || '').trim();
      const merged = base ? `${base}\n\n${aiSuggestion}` : aiSuggestion;
      return { ...prev, content: merged };
    });
    closeAiSuggestionModal();
  }, [aiSuggestion, closeAiSuggestionModal]);

  const handlePostSubmit = useCallback(async () => {
    if (!user) return;
    if (!publishGuardRef.current.tryBegin()) {
      return;
    }
    const attachmentGate = canPublishWithAttachments(postDraft.media);
    if (!attachmentGate.ok) {
      showNotification('warning', 'Posts', attachmentGate.reason);
      setComposerStatusMessage(attachmentGate.reason);
      publishGuardRef.current.end();
      return;
    }
    const attachmentFileIds = postDraft.media.map((m) => m.id).filter(Boolean) as string[];
    const hasText = Boolean(postDraft.title.trim() || postDraft.content.trim());
    if (!hasText && attachmentFileIds.length === 0) {
      showNotification('warning', 'Posts', 'Add text or at least one attachment.');
      setComposerStatusMessage('Add text or at least one attachment.');
      publishGuardRef.current.end();
      return;
    }
    setPosting(true);
    setComposerStatusMessage('Publishing…');
    try {
      const submitLocation = composePostLocationValue(postDraft.location, postDraft.region);
      const created = await CommunityService.createPost({
        title: postDraft.title.trim(),
        content: postDraft.content,
        attachmentFileIds,
        businessPageId: activePostBusinessPageId || undefined,
        topic: postDraft.topic || undefined,
        location: submitLocation || undefined,
        visibility: postDraft.visibility,
        commentPolicy: postDraft.commentPolicy,
        graphicWarning: postDraft.graphicWarning,
        isAIEnhanced: postDraft.isAIEnhanced,
        aiInsightEnabled: postAiInsightPreferenceToBoolean(postDraft.aiInsightPreference),
        offerTags: postDraft.offerTags
      });
      // Clear blob previews before wiping draft.
      postDraft.media.forEach((item) => revokePreviewUrl(item.url));
      postMediaCountRef.current = 0;
      postMediaItemsRef.current = [];
      setPostDraft(createEmptyPostDraft());
      setPostLocationDetails(null);
      setPostLocationPickerOpen(false);
      setDesktopComposerOpen(false);
      setComposerDraftNotice(null);
      clearComposerDraft(composerDraftKey);
      if (created) {
        const normalized = normalizePost(created);
        setFeedItems((prev) => [normalized, ...prev.filter((item) => String(item.id) !== String(normalized.id))]);
        setCommentCounts((prev) => ({ ...prev, [normalized.id]: 0 }));
      }
      setComposerStatusMessage('Your update is live.');
      showNotification('success', 'Posts', 'Your update is live.');
    } catch (error: any) {
      console.error('Post failed', error);
      const serverMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Unable to post update.';
      setComposerStatusMessage(serverMessage);
      showNotification('error', 'Posts', serverMessage);
      // Keep draft + attachments on failure (do not clear).
    } finally {
      setPosting(false);
      publishGuardRef.current.end();
    }
  }, [activePostBusinessPageId, composerDraftKey, normalizePost, postDraft, showNotification, user]);

  const beginEditPost = useCallback((post: FeedPost) => {
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
      region: '',
      location: post.location || '',
      visibility: (post.visibility as PostDraft['visibility']) || 'public',
      commentPolicy,
      graphicWarning: Boolean(post.graphicWarning),
      isAIEnhanced: Boolean(post.isAIEnhanced),
      aiInsightPreference: resolveStoredPostAiInsightPreference(post.aiInsightEnabled),
      offerTags: normalizeContentOfferTags(post.offerTags).map((entry) => ({
        offerType: entry.offerType as OfferTagSelection['offerType'],
        offerId: entry.offerId
      })),
      media: (post.attachments || []).map((media, index) => ({
        localId: `${post.id}-media-${media.id || index}`,
        id: media.id,
        url: media.url,
        name: media.name,
        type: inferMediaType(media)
      }))
    });
  }, []);

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
    const attachmentFileIds = editingDraft.media.map((media) => media.id).filter(Boolean) as string[];
    const hasText = Boolean(editingDraft.title.trim() || editingDraft.content.trim());
    if (!hasText && attachmentFileIds.length === 0) {
      showNotification('warning', 'Posts', 'Add text or keep at least one attachment.');
      return;
    }
    if (postActionBusy[editingPostId]) return;
    setPostActionBusy((prev) => ({ ...prev, [editingPostId]: true }));
    try {
      const updated = await CommunityService.updatePost(editingPostId, {
        title: editingDraft.title.trim(),
        content: editingDraft.content,
        attachmentFileIds,
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

  const handleDeletePost = useCallback(async (post: FeedPost) => {
    if (!user) return;
    if (!confirm('Delete this post?')) return;
    setPostActionBusy((prev) => ({ ...prev, [post.id]: true }));
    try {
      await CommunityService.deletePost(post.id);
      setFeedItems((prev) => prev.filter((item) => item.id !== post.id));
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

  const handleTogglePin = useCallback(async (post: FeedPost) => {
    if (!user) return;
    const authorId = resolvePostOwnerUserId(post);
    if (!authorId || authorId !== String(user.id)) {
      showNotification('warning', 'Pin', 'Only the post author can pin this update.');
      return;
    }
    if (!post.isPinned) {
      const pinnedCount = feedItems.filter(
        (item) => item.isPinned && resolvePostOwnerUserId(item) === String(user.id)
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
  }, [applyPostUpdate, feedItems, normalizePost, resolvePostOwnerUserId, showNotification, user]);

  const handleToggleHighlight = useCallback(async (post: FeedPost) => {
    if (!user) return;
    const authorId = resolvePostOwnerUserId(post);
    if (!authorId || authorId !== String(user.id)) {
      showNotification('warning', 'Highlight', 'Only the post author can highlight this update.');
      return;
    }
    if (!post.isHighlighted) {
      const highlightedCount = feedItems.filter(
        (item) => item.isHighlighted && resolvePostOwnerUserId(item) === String(user.id)
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
  }, [applyPostUpdate, feedItems, normalizePost, resolvePostOwnerUserId, showNotification, user]);

  const publishStoryText = useCallback(async () => {
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
      setStories((prev) =>
        filterActiveStories([created, ...prev.filter((item) => String(item?.id) !== String(created?.id))]).slice(0, maxStories)
      );
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
  }, [maxStories, showNotification, storyDraft, user]);

  const clearStoryMediaUploadState = useCallback(() => {
    setStoryMediaUploadBusy(false);
    setStoryMediaUploadLabel('');
    setStoryMediaUploadProgress(0);
  }, []);

  const openStoryEditor = useCallback((story: any) => {
    if (!story) return;
    const style = getStoryTextStyle(story);
    setEditingStory(story);
    setStoryEditDraft({
      content: resolveStoryContent(story) || '',
      visibility: normalizeStoryVisibility(story.visibility),
      textBackground: style.background,
      textColor: style.color,
      textFont: style.fontFamily,
      textAlign: (style.textAlign as StoryDraft['textAlign']) || 'center'
    });
    setStoryEditOpen(true);
  }, []);

  const saveStoryEdit = useCallback(async () => {
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
  }, [applyStoryUpdate, canManageStory, editingStory, showNotification, storyEditDraft]);

  const handleStoryDelete = useCallback(async (story: any) => {
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
  }, [canManageStory, showNotification]);

  const handleStoryLike = useCallback(async (story: any) => {
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
  }, [applyStoryUpdate, showNotification, storyActionBusy, user]);

  const publishStoryFile = useCallback(async (file: File, type: 'image' | 'video') => {
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
        caption: storyDraft.content?.trim() || undefined,
        visibility: storyDraft.visibility
      });
      setStories((prev) =>
        filterActiveStories([created, ...prev.filter((item) => String(item?.id) !== String(created?.id))]).slice(0, maxStories)
      );
      showNotification('success', 'Stories', 'Your story is live.');
    } catch (error: any) {
      console.error(error);
      showNotification('error', 'Stories', error?.message || 'Unable to post story.');
    } finally {
      setStoryPosting(false);
      clearStoryMediaUploadState();
    }
  }, [clearStoryMediaUploadState, maxStories, showNotification, storyDraft.visibility, user]);

  const handleStoryDeviceSelection = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] || null;
      event.currentTarget.value = '';
      if (!file || !user) return;
      const mime = String(file.type || '').toLowerCase();
      const type = mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : null;
      if (!type) {
        showNotification('warning', 'Stories', 'Please choose an image or video file.');
        return;
      }
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
        setStoryMediaUploadLabel(`${file.name} is ready to publish.`);
        setStoryMediaDraftFile(uploaded);
        setStoryMediaPreviewOpen(true);
      } catch (error: any) {
        console.error(error);
        showNotification('error', 'Stories', error?.message || 'Unable to upload story media.');
        clearStoryMediaUploadState();
      } finally {
        setStoryPosting(false);
        setStoryMediaUploadBusy(false);
      }
    },
    [clearStoryMediaUploadState, showNotification, storyDraft.visibility, user]
  );

  const publishStorySelectedMedia = useCallback(async () => {
    if (!user) return;
    if (!storyMediaDraftFile?.id) return;
    setStoryPosting(true);
    setStoryMediaUploadBusy(true);
    setStoryMediaUploadProgress(100);
    setStoryMediaUploadLabel('Preparing your story for publish...');
    let published = false;
    try {
      const mime = String(storyMediaDraftFile?.mimeType || storyMediaDraftFile?.mime_type || '').toLowerCase();
      const explicitType = String(storyMediaDraftFile?.type || '').toLowerCase();
      const type = explicitType === 'video' || mime.startsWith('video/') ? 'video' : 'image';
      const created = await CommunityService.createStory({
        type,
        mediaFileId: storyMediaDraftFile.id,
        caption: storyDraft.content?.trim() || undefined,
        visibility: storyDraft.visibility
      });
      setStories((prev) =>
        filterActiveStories([created, ...prev.filter((item) => String(item?.id) !== String(created?.id))]).slice(0, maxStories)
      );
      setStoryMediaPreviewOpen(false);
      setStoryMediaDraftFile(null);
      setStoryDraft((prev) => ({ ...prev, content: '' }));
      published = true;
      showNotification('success', 'Stories', 'Your story is live.');
    } catch (error: any) {
      console.error(error);
      showNotification('error', 'Stories', error?.message || 'Unable to post story.');
      setStoryMediaUploadLabel('Media is ready. Review your caption and try publishing again.');
    } finally {
      setStoryPosting(false);
      if (published) {
        clearStoryMediaUploadState();
      } else {
        setStoryMediaUploadBusy(false);
        setStoryMediaUploadProgress(storyMediaDraftFile?.id ? 100 : 0);
      }
    }
  }, [clearStoryMediaUploadState, maxStories, showNotification, storyDraft.content, storyDraft.visibility, storyMediaDraftFile, user]);

  const startStoryCamera = useCallback(async () => {
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
  }, [showNotification]);

  const stopStoryCamera = useCallback(() => {
    if (storyRecorderRef.current && storyRecording) {
      try {
        storyRecorderRef.current.stop();
      } catch (e) {
        console.error(e);
      }
      return;
    }
    if (storyCameraStream) {
      storyCameraStream.getTracks().forEach((track) => track.stop());
    }
    setStoryCameraStream(null);
    setStoryCameraOpen(false);
    setStoryRecording(false);
  }, [storyCameraStream, storyRecording]);

  const captureStoryPhoto = useCallback(() => {
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
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `story-${Date.now()}.png`, { type: blob.type || 'image/png' });
      publishStoryFile(file, 'image').finally(() => stopStoryCamera());
    }, 'image/png');
  }, [publishStoryFile, stopStoryCamera]);

  const startStoryRecording = useCallback(() => {
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
      if (event.data && event.data.size > 0) storyChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(storyChunksRef.current, { type: recorder.mimeType || 'video/webm' });
      if (blob.size) {
        const file = new File([blob], `story-${Date.now()}.webm`, { type: blob.type });
        publishStoryFile(file, 'video').finally(() => stopStoryCamera());
      } else {
        stopStoryCamera();
      }
      setStoryRecording(false);
    };
    storyRecorderRef.current = recorder;
    recorder.start();
    setStoryRecording(true);
  }, [publishStoryFile, showNotification, stopStoryCamera, storyCameraStream, storyRecording]);

  const stopStoryRecording = useCallback(() => {
    if (!storyRecorderRef.current) return;
    try {
      storyRecorderRef.current.stop();
    } catch (e) {
      console.error(e);
    }
  }, []);

  const openStory = useCallback(async (story: any) => {
    setActiveStory(story);
    if (story?.id) {
      try {
        await CommunityService.viewStory(story.id);
      } catch (e) {
        console.error('Failed to record story view', e);
      }
    }
  }, []);

  const engageStoryAndSync = useCallback(
    async (story: any, type: 'comment' | 'repost' | 'dash' | 'send') => {
      const storyId = String(story?.id || '').trim();
      if (!storyId) return null;
      const response = await CommunityService.engageStory(storyId, type);
      const payload = response?.story || response;
      const interactions = response?.interactions || payload?.interactions || {};
      applyStoryUpdate({
        ...story,
        ...(payload || {}),
        commentsCount: interactions.comments ?? payload?.commentsCount ?? story.commentsCount ?? 0,
        repostsCount: interactions.reposts ?? payload?.repostsCount ?? story.repostsCount ?? 0,
        dashesCount: interactions.dashes ?? payload?.dashesCount ?? story.dashesCount ?? 0,
        sendsCount: interactions.sends ?? payload?.sendsCount ?? story.sendsCount ?? 0,
        interactions: {
          ...(story.interactions || {}),
          comments: interactions.comments ?? payload?.commentsCount ?? story.interactions?.comments ?? story.commentsCount ?? 0,
          reposts: interactions.reposts ?? payload?.repostsCount ?? story.interactions?.reposts ?? story.repostsCount ?? 0,
          dashes: interactions.dashes ?? payload?.dashesCount ?? story.interactions?.dashes ?? story.dashesCount ?? 0,
          sends: interactions.sends ?? payload?.sendsCount ?? story.interactions?.sends ?? story.sendsCount ?? 0
        }
      });
      window.dispatchEvent(
        new CustomEvent('community:story_engaged', {
          detail: {
            storyId,
            type,
            interactions,
            story: {
              id: storyId,
              ...(payload || {}),
              commentsCount: interactions.comments ?? payload?.commentsCount ?? story.commentsCount ?? 0,
              repostsCount: interactions.reposts ?? payload?.repostsCount ?? story.repostsCount ?? 0,
              dashesCount: interactions.dashes ?? payload?.dashesCount ?? story.dashesCount ?? 0,
              sendsCount: interactions.sends ?? payload?.sendsCount ?? story.sendsCount ?? 0,
              interactions: {
                ...(story.interactions || {}),
                comments: interactions.comments ?? payload?.commentsCount ?? story.interactions?.comments ?? story.commentsCount ?? 0,
                reposts: interactions.reposts ?? payload?.repostsCount ?? story.interactions?.reposts ?? story.repostsCount ?? 0,
                dashes: interactions.dashes ?? payload?.dashesCount ?? story.interactions?.dashes ?? story.dashesCount ?? 0,
                sends: interactions.sends ?? payload?.sendsCount ?? story.interactions?.sends ?? story.sendsCount ?? 0
              }
            }
          }
        })
      );
      return response;
    },
    [applyStoryUpdate]
  );

  const buildStoryUrl = useCallback((storyId: string) => {
    return buildPublicAppUrl(`/community?story=${encodeURIComponent(storyId)}`);
  }, []);

  const ensureStoryAuth = useCallback(
    (promptMessage: string) => {
      if (user?.id) return true;
      if (confirm(promptMessage)) window.location.href = '/auth/login';
      return false;
    },
    [user?.id]
  );

  const handleStoryCommentAction = useCallback(
    async (story: any) => {
      if (!ensureStoryAuth('Log in to comment on stories?')) return;
      if (!story?.id) return;
      setStoryActionTarget(story);
      setStoryCommentOpen(true);
    },
    [ensureStoryAuth]
  );

  const handleStoryRepostAction = useCallback(
    async (story: any) => {
      if (!ensureStoryAuth('Log in to repost stories?')) return;
      if (!story?.id) return;
      setStoryActionTarget(story);
      setStoryRepostOpen(true);
    },
    [ensureStoryAuth]
  );

  const handleStorySendAction = useCallback(
    async (story: any) => {
      if (!story?.id) return;
      setStoryActionTarget(story);
      setStorySendOpen(true);
    },
    []
  );

  const handleStoryDashAction = useCallback(
    async (story: any) => {
      if (!ensureStoryAuth('Log in to dash story creators?')) return;
      if (!story?.id) return;
      setStoryActionTarget(story);
      setStoryDashOpen(true);
    },
    [ensureStoryAuth]
  );

  const repostStory = useCallback(
    async (comment?: string) => {
      const story = storyActionTarget;
      const storyId = String(story?.id || '').trim();
      if (!storyId || storyActionBusy[storyId]) return;
      const authorName = resolveStoryAuthorName(story, 'Community member');
      const storyText = String(resolveStoryContent(story) || '').trim();
      const link = buildStoryUrl(storyId);
      const wrapperComment = String(comment || '').trim();
      setStoryActionBusy((prev) => ({ ...prev, [storyId]: true }));
      try {
        await CommunityService.createPost({
          title: storyText ? `Story repost - ${authorName}` : undefined,
          content: wrapperComment ? `${wrapperComment}\n\n${link}` : `${storyText || `Reposted a story by ${authorName}.`}\n\n${link}`,
          attachmentFileIds:
            story?.mediaFileId && String(story?.authorId || '') === String(user?.id || '')
              ? [story.mediaFileId]
              : undefined
        });
        await engageStoryAndSync(story, 'repost');
        setStoryRepostOpen(false);
        showNotification('success', 'Stories', 'Story reposted.');
      } catch (error: any) {
        showNotification('error', 'Stories', error?.message || 'Unable to repost this story.');
      } finally {
        setStoryActionBusy((prev) => ({ ...prev, [storyId]: false }));
      }
    },
    [buildStoryUrl, engageStoryAndSync, showNotification, storyActionBusy, storyActionTarget, user?.id]
  );

  const activeStoryIndex = activeStory?.id ? stories.findIndex((story) => story.id === activeStory.id) : -1;
  const hasPrevStory = activeStoryIndex > 0;
  const hasNextStory = activeStoryIndex >= 0 && activeStoryIndex < stories.length - 1;
  const storyOverlayShouldShow = !storyTouchOverlayMode || storyOverlayVisible;
  const activeStoryAuthorId = String(
    activeStory?.authorId || activeStory?.author?.id || activeStory?.userId || activeStory?.user?.id || activeStory?.user_id || ''
  ).trim();
  const activeStoryInitialIsFollowing = activeStoryAuthorId
    ? (followStateMap[activeStoryAuthorId] ?? activeStory?.viewer?.isFollowingAuthor)
    : undefined;

  useEffect(() => {
    setStoryOverlayVisible(!storyTouchOverlayMode);
  }, [activeStory?.id, storyTouchOverlayMode]);

  useEffect(() => {
    if (storyOverlayHideTimerRef.current) {
      window.clearTimeout(storyOverlayHideTimerRef.current);
      storyOverlayHideTimerRef.current = null;
    }
    if (!activeStory?.id || !storyTouchOverlayMode || !storyOverlayVisible) return;
    storyOverlayHideTimerRef.current = window.setTimeout(() => {
      setStoryOverlayVisible(false);
    }, STORY_CONTROL_HIDE_DELAY_MS);
    return () => {
      if (storyOverlayHideTimerRef.current) {
        window.clearTimeout(storyOverlayHideTimerRef.current);
        storyOverlayHideTimerRef.current = null;
      }
    };
  }, [activeStory?.id, storyOverlayVisible, storyTouchOverlayMode]);

  const goToStoryByOffset = useCallback(
    (offset: number) => {
      if (!activeStory?.id) return;
      const index = stories.findIndex((story) => story.id === activeStory.id);
      if (index < 0) return;
      const nextIndex = index + offset;
      if (nextIndex < 0 || nextIndex >= stories.length) return;
      const target = stories[nextIndex];
      if (target) void openStory(target);
    },
    [activeStory?.id, stories, openStory]
  );

  const advanceActiveStory = useCallback(() => {
    if (!activeStory?.id) return;
    if (hasNextStory) {
      void goToStoryByOffset(1);
      return;
    }
    setActiveStory(null);
  }, [activeStory?.id, goToStoryByOffset, hasNextStory]);

  const onStoryGestureStart = useCallback((event: React.TouchEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, label')) {
      storyGestureStartRef.current = null;
      return;
    }
    revealStoryOverlay();
    const touch = event.changedTouches?.[0];
    if (!touch) {
      storyGestureStartRef.current = null;
      return;
    }
    storyGestureStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, [revealStoryOverlay]);

  const onStoryGestureEnd = useCallback(
    (event: React.TouchEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select, label')) return;
      const start = storyGestureStartRef.current;
      const touch = event.changedTouches?.[0];
      storyGestureStartRef.current = null;
      if (!start || !touch) return;
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) >= 20 && Math.abs(deltaX) > Math.abs(deltaY) + 6) {
        if (deltaX > 0) goToStoryByOffset(-1);
        if (deltaX < 0) goToStoryByOffset(1);
        return;
      }
      if (!activeStory) return;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 18) return;
      const now = Date.now();
      if (storyLastTapAtRef.current && now - storyLastTapAtRef.current <= 320) {
        event.preventDefault();
        event.stopPropagation();
        storyLastTapAtRef.current = 0;
        void handleStoryLike(activeStory);
        return;
      }
      storyLastTapAtRef.current = now;
    },
    [activeStory, goToStoryByOffset, handleStoryLike]
  );

  const onStoryMediaDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select, label')) return;
      if (!activeStory) return;
      event.preventDefault();
      event.stopPropagation();
      void handleStoryLike(activeStory);
    },
    [activeStory, handleStoryLike]
  );

  useEffect(() => {
    if (!activeStory?.id) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToStoryByOffset(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToStoryByOffset(1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setActiveStory(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeStory?.id, goToStoryByOffset]);

  useEffect(() => {
    if (storyAutoAdvanceTimerRef.current) {
      window.clearTimeout(storyAutoAdvanceTimerRef.current);
      storyAutoAdvanceTimerRef.current = null;
    }
    if (!activeStory?.id) return;
    const delay = resolveStoryAutoAdvanceDelay(activeStory);
    storyAutoAdvanceTimerRef.current = window.setTimeout(() => {
      advanceActiveStory();
    }, delay);
    return () => {
      if (storyAutoAdvanceTimerRef.current) {
        window.clearTimeout(storyAutoAdvanceTimerRef.current);
        storyAutoAdvanceTimerRef.current = null;
      }
    };
  }, [activeStory?.commentsCount, activeStory?.createdAt, activeStory?.id, activeStory?.media?.duration, advanceActiveStory]);

  const activeStoryShareUrl = storyActionTarget?.id
    ? buildStoryUrl(String(storyActionTarget.id))
    : buildPublicAppUrl('/community');
  const activeStoryDashRecipient = String(
    storyActionTarget?.authorId || storyActionTarget?.author?.id || storyActionTarget?.userId || ''
  ).trim();
  const downloadStoryMedia = useCallback(
    async (story: any) => {
      const media = resolveStoryMedia(story);
      if (!media.src) {
        showNotification('warning', 'Stories', 'No downloadable media is attached to this story.');
        return;
      }
      try {
        const result = await downloadToDevice({
          url: media.src,
          fileName: `${resolveStoryAuthorName(story, 'story')}-story-${String(story?.id || Date.now())}`,
          mimeType: media.kind === 'video' ? 'video/mp4' : media.kind === 'image' ? 'image/jpeg' : ''
        });
        showNotification(
          'success',
          'Stories',
          result.native ? `Saved to ${result.path || 'your device'}.` : 'Download started.'
        );
      } catch (error: any) {
        showNotification('error', 'Stories', error?.message || 'Unable to download story media.');
      }
    },
    [showNotification]
  );

  // Initial feed only when user/tab/filters change — NOT when loadFeed identity changes
  // (cursor/pagination updates must not re-trigger a full initial load).
  const userId = user?.id;
  useEffect(() => {
    if (!userId || !feedTabReady) return;
    // Deliberate surface change: allow orchestrated retry and clear empty-loop guards.
    feedLastCompletedCursorRef.current = null;
    feedLastCompletedAddedRef.current = 0;
    feedEmptyPageStreakRef.current = 0;
    feedDiscoveryUsedRef.current = false;
    feedTerminalRef.current = false;
    setFeedTerminal(false);
    feedNextCursorRef.current = null;
    setFeedNextCursor(null);
    feedOffsetFallbackRef.current = false;
    setFeedOffsetFallbackEnabled(false);
    // Tab/filter change is a deliberate hard reset of the primary stream.
    void loadFeed({ forceRetryOrchestrated: true, hardReset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadFeed omitted intentionally to stop request loops
  }, [userId, feedTab, feedTopic, feedRegion, feedTabReady]);

  useEffect(() => {
    if (feedTabInitializedRef.current) return;
    let restored: FeedTab | null = null;
    try {
      const stored = window.localStorage.getItem(feedTabStorageKey);
      const parsed = normalizeFeedTabValue(stored);
      if (parsed) {
        restored = showIntentModes && parsed === 'latest' ? defaultIntentFeedTab : parsed;
      }
    } catch (e) {
      // Ignore storage failures and continue with defaults.
    }
    setFeedTab(restored || defaultFeedTab);
    feedTabInitializedRef.current = true;
    setFeedTabReady(true);
  }, [defaultFeedTab, defaultIntentFeedTab, feedTabStorageKey, showIntentModes]);

  useEffect(() => {
    if (!feedCacheKey) return;
    try {
      const raw = window.localStorage.getItem(feedCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { items?: FeedPost[] };
      const cachedItems = Array.isArray(parsed?.items) ? parsed.items : [];
      if (!cachedItems.length) return;
      commitFeedItems(cachedItems);
    } catch {
      // Ignore cache read failures.
    }
  }, [commitFeedItems, feedCacheKey]);

  useEffect(() => {
    if (!feedTabInitializedRef.current) return;
    try {
      window.localStorage.setItem(feedTabStorageKey, feedTab);
    } catch (e) {
      // Ignore storage write errors.
    }
  }, [feedTab, feedTabStorageKey]);

  useEffect(() => {
    if (showIntentModes && feedTab === 'latest') {
      setFeedTab(defaultIntentFeedTab);
      return;
    }
    if (!showIntentModes && isIntentFeedTab(feedTab)) {
      setFeedTab(showFollowing ? 'following' : showTrending ? 'trending' : 'latest');
      return;
    }
    if (feedTab === 'following' && !showFollowing) {
      setFeedTab(showIntentModes ? defaultIntentFeedTab : showTrending ? 'trending' : 'latest');
      return;
    }
    if (feedTab === 'trending' && !showTrending) {
      setFeedTab(showFollowing ? 'following' : showIntentModes ? defaultIntentFeedTab : 'latest');
      return;
    }
    if (!showIntentModes && feedTab === 'latest' && !showDiscover) {
      setFeedTab(showFollowing ? 'following' : showTrending ? 'trending' : 'latest');
    }
  }, [defaultIntentFeedTab, feedTab, showDiscover, showFollowing, showIntentModes, showTrending]);

  useEffect(() => {
    if (!user) return;
    loadSidebar();
  }, [user, loadSidebar]);

  useEffect(() => {
    if (!user) return;
    if (showStories) loadStories();
    if (showStories) loadReels();
    if (showMessages) loadMessages();
    if (showSlider) loadSlider();
  }, [user, showStories, showMessages, showSlider, loadStories, loadReels, loadMessages, loadSlider]);

  useEffect(() => {
    setRenderedFeedItemCount((prev) => {
      if (!feedItems.length) {
        renderedFeedItemCountRef.current = desktopInitialRenderCount;
        return desktopInitialRenderCount;
      }
      const minimum = Math.min(desktopInitialRenderCount, feedItems.length);
      let next = prev;
      if (prev < minimum) next = minimum;
      if (prev > feedItems.length) next = feedItems.length;
      renderedFeedItemCountRef.current = next;
      return next;
    });
  }, [desktopInitialRenderCount, feedItems.length]);

  useEffect(() => {
    viewTracked.current.clear();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !renderableFeedItems.length) return;
    renderableFeedItems.forEach((post) => {
      if (!post?.id || viewTracked.current.has(post.id)) return;
      viewTracked.current.add(post.id);
      CommunityService.postView(post.id).catch(() => {});
    });
  }, [renderableFeedItems, user?.id]);

  // Single stable IntersectionObserver — callback reads refs so pagination state
  // changes do not disconnect/reconnect (which re-fires while the sentinel is visible).
  const loadMoreFeedRef = useRef(loadMoreFeed);
  loadMoreFeedRef.current = loadMoreFeed;
  useEffect(() => {
    const node = desktopFeedSentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const hasUnrendered =
          renderedFeedItemCountRef.current < feedItemsRef.current.length;
        if (hasUnrendered && entry?.isIntersecting) {
          setRenderedFeedItemCount((prev) => {
            const next = Math.min(
              feedItemsRef.current.length,
              prev + desktopRenderStep
            );
            renderedFeedItemCountRef.current = next;
            return next;
          });
          return;
        }
        if (
          !shouldAllowObserverLoadMore({
            isIntersecting: Boolean(entry?.isIntersecting),
            initialLoading: feedLoadingRef.current,
            loadMoreInFlight: feedLoadingMoreRef.current,
            isTerminal: feedTerminalRef.current,
            hasCursor: Boolean(String(feedNextCursorRef.current || '').trim()),
            offsetFallbackEnabled: feedOffsetFallbackRef.current,
            secondarySourceRemaining: !feedDiscoveryUsedRef.current,
            hasUnrenderedItems: hasUnrendered
          })
        ) {
          return;
        }
        void loadMoreFeedRef.current();
      },
      // Moderate rootMargin: 900px kept the sentinel constantly intersecting on short pages.
      { rootMargin: '320px 0px', threshold: 0 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [desktopRenderStep, userId, feedTabReady]);

  useEffect(() => {
    if (!socket || !user) return;
    const softRefreshFeed = () => {
      void loadFeed();
    };
    const refreshStories = () => loadStories();
    const refreshSlider = () => loadSlider();
    const refreshSidebar = () => scheduleSidebarRefresh();
    const handlePostCreated = (payload: any) => {
      const created = payload?.post || payload;
      if (!created?.id) {
        softRefreshFeed();
        return;
      }
      const normalized = normalizePost(created);
      // Realtime insert must not reset pagination or clear the list.
      setFeedItems((prev) => {
        const { next, inserted } = prependRealtimeItem(prev, normalized);
        if (!inserted) return prev;
        feedItemsRef.current = next;
        setRenderedFeedItemCount((count) => {
          const updated = Math.min(next.length, Math.max(count + 1, count));
          renderedFeedItemCountRef.current = updated;
          return updated;
        });
        return next;
      });
      syncCommentCount(normalized.id, normalized.interactions?.comments ?? 0);
    };
    const handlePostAiInsightReady = (payload: any) => {
      const detail = payload?.post || payload || {};
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
      } as FeedPost);
    };
    const handleStoryCreated = (payload: any) => {
      const created = payload?.story || payload;
      if (!created?.id) {
        refreshStories();
        return;
      }
      setStories((prev) => {
        const exists = prev.some((story) => story.id === created.id);
        if (exists) return prev;
        return filterActiveStories([created, ...prev]);
      });
    };
    const handleStoryUpdated = (payload: any) => {
      const updated = payload?.story || payload;
      if (updated?.id) {
        applyStoryUpdate(updated);
      } else {
        refreshStories();
      }
    };
    const handleStoryLiked = (payload: any) => {
      const storyId = payload?.storyId;
      if (!storyId) return;
      const likesCount = payload?.likesCount;
      const likedByViewer = user?.id ? String(payload?.userId) === String(user.id) && payload?.liked : undefined;
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
    const handleStoryEngaged = (payload: any) => {
      const detail = payload?.story || payload;
      if (detail?.id) {
        applyStoryUpdate(detail);
        return;
      }
      const storyId = String(payload?.storyId || '').trim();
      if (!storyId) return;
      const interactions = payload?.interactions || {};
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
    socket.on('community:post_created', handlePostCreated);
    socket.on('community:post_updated', softRefreshFeed);
    socket.on('community:post_deleted', softRefreshFeed);
    socket.on('community:story_created', handleStoryCreated);
    socket.on('community:story_deleted', refreshStories);
    socket.on('community:story_updated', handleStoryUpdated);
    socket.on('community:story_liked', handleStoryLiked);
    socket.on('community:story_engaged', handleStoryEngaged);
    socket.on('community:post_ai_insight_ready', handlePostAiInsightReady);
    socket.on('post:aiInsightReady', handlePostAiInsightReady);
    socket.on('community:homepage_updated', refreshSlider);
    socket.on('community:profile_view_logged', refreshSidebar);
    socket.on('community:job_published', refreshSidebar);
    socket.on('community:gig_published', refreshSidebar);
    socket.on('reco:config_updated', refreshSidebar);
    socket.on('reco:rules_updated', refreshSidebar);
    return () => {
      socket.off('community:post_created', handlePostCreated);
      socket.off('community:post_updated', softRefreshFeed);
      socket.off('community:post_deleted', softRefreshFeed);
      socket.off('community:story_created', handleStoryCreated);
      socket.off('community:story_deleted', refreshStories);
      socket.off('community:story_updated', handleStoryUpdated);
      socket.off('community:story_liked', handleStoryLiked);
      socket.off('community:story_engaged', handleStoryEngaged);
      socket.off('community:post_ai_insight_ready', handlePostAiInsightReady);
      socket.off('post:aiInsightReady', handlePostAiInsightReady);
      socket.off('community:homepage_updated', refreshSlider);
      socket.off('community:profile_view_logged', refreshSidebar);
      socket.off('community:job_published', refreshSidebar);
      socket.off('community:gig_published', refreshSidebar);
      socket.off('reco:config_updated', refreshSidebar);
      socket.off('reco:rules_updated', refreshSidebar);
    };
  }, [socket, user, loadFeed, loadStories, loadSlider, scheduleSidebarRefresh, applyPostUpdate, applyStoryUpdate, normalizePost, syncCommentCount, filterActiveStories]);

  useEffect(() => {
    if (!user?.id) return;
    const onFollowUpdated = (event: Event) => {
      const payload = (event as CustomEvent).detail;
      applyFollowUpdatePayload(payload, user.id);
      scheduleSidebarRefresh();
    };
    window.addEventListener('community:follow_updated', onFollowUpdated as EventListener);
    return () => window.removeEventListener('community:follow_updated', onFollowUpdated as EventListener);
  }, [user?.id, scheduleSidebarRefresh]);

  useEffect(() => {
    const onPostMetricsUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const postId = String(detail?.postId || detail?.id || '').trim();
      if (!postId) return;

      const metricsSource = detail?.interactions || detail?.counts || {};
      const interactions: FeedPost['interactions'] = {};
      const likes = metricsSource?.likes ?? detail?.likesCount ?? detail?.likes;
      const comments = metricsSource?.comments ?? detail?.commentsCount ?? detail?.comments;
      const shares = metricsSource?.shares ?? detail?.sharesCount ?? detail?.shares;
      const reposts = metricsSource?.reposts ?? detail?.repostsCount ?? detail?.reposts;
      const views = metricsSource?.views ?? detail?.viewsCount ?? detail?.views;

      if (likes !== undefined) interactions.likes = Number(likes) || 0;
      if (comments !== undefined) interactions.comments = Number(comments) || 0;
      if (shares !== undefined) interactions.shares = Number(shares) || 0;
      if (reposts !== undefined) interactions.reposts = Number(reposts) || 0;
      if (views !== undefined) interactions.views = Number(views) || 0;

      if (Object.keys(interactions).length === 0) return;
      applyPostUpdate({ id: postId, interactions } as FeedPost);
    };

    const onPostReactionUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const postId = String(detail?.postId || detail?.id || '').trim();
      const reactions = detail?.reactions;
      if (!postId || !reactions || typeof reactions !== 'object') return;
      applyPostUpdate({
        id: postId,
        interactions: { reactions: reactions as Record<string, number> }
      } as FeedPost);
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
      } as FeedPost);
    };

    window.addEventListener('community:post_metrics_updated', onPostMetricsUpdated as EventListener);
    window.addEventListener('community:post_reaction_updated', onPostReactionUpdated as EventListener);
    window.addEventListener('community:post_ai_insight_ready', onPostAiInsightReady as EventListener);
    window.addEventListener('post:aiInsightReady', onPostAiInsightReady as EventListener);
    return () => {
      window.removeEventListener('community:post_metrics_updated', onPostMetricsUpdated as EventListener);
      window.removeEventListener('community:post_reaction_updated', onPostReactionUpdated as EventListener);
      window.removeEventListener('community:post_ai_insight_ready', onPostAiInsightReady as EventListener);
      window.removeEventListener('post:aiInsightReady', onPostAiInsightReady as EventListener);
    };
  }, [applyPostUpdate]);

  useEffect(() => {
    if (!user?.id) return;
    const onProfileViewLogged = (event: Event) => {
      const payload = (event as CustomEvent).detail || {};
      const viewedUserId = String(payload.viewedUserId || '').trim();
      const viewerId = String(payload.viewerId || '').trim();
      if (viewedUserId === String(user.id) || viewerId === String(user.id)) {
        scheduleSidebarRefresh();
      }
    };
    window.addEventListener('community:profile_view_logged', onProfileViewLogged as EventListener);
    return () => window.removeEventListener('community:profile_view_logged', onProfileViewLogged as EventListener);
  }, [user?.id, scheduleSidebarRefresh]);

  useEffect(() => {
    if (socket || !user) return;
    const id = window.setInterval(() => {
      loadFeed();
      loadSidebar();
    }, 60000);
    return () => window.clearInterval(id);
  }, [socket, user, loadFeed, loadSidebar]);

  useEffect(() => {
    if (!user || (!showProfileViewers && !showProfileViewing)) return;
    const id = window.setInterval(() => {
      loadSidebar();
    }, 30000);
    return () => window.clearInterval(id);
  }, [user, showProfileViewers, showProfileViewing, loadSidebar]);

  useEffect(() => {
    if (!showStories) return;
    const id = window.setInterval(() => {
      setStories((prev) => filterActiveStories(prev));
    }, 60000);
    return () => window.clearInterval(id);
  }, [filterActiveStories, showStories]);

  useEffect(() => {
    const onScrollNew = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      const created = detail?.scroll || detail;
      if (!created?.id) return;
      setReels((prev) => [created, ...prev.filter((item) => item.id !== created.id)].slice(0, maxReels));
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
  }, [maxReels]);

  useEffect(() => {
    return () => {
      if (sidebarRefreshTimeoutRef.current) {
        window.clearTimeout(sidebarRefreshTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (cameraOpen && cameraVideoRef.current && cameraStream) {
      cameraVideoRef.current.srcObject = cameraStream;
    }
  }, [cameraOpen, cameraStream]);

  useEffect(() => {
    if (storyCameraOpen && storyVideoRef.current && storyCameraStream) {
      storyVideoRef.current.srcObject = storyCameraStream;
    }
  }, [storyCameraOpen, storyCameraStream]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && isRecording) {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          console.error(e);
        }
      }
      if (storyRecorderRef.current && storyRecording) {
        try {
          storyRecorderRef.current.stop();
        } catch (e) {
          console.error(e);
        }
      }
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      if (storyCameraStream) {
        storyCameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream, storyCameraStream, isRecording, storyRecording]);

  useEffect(() => {
    const currentAds = [sidebarTopAd, sidebarFeaturedAd, sidebarMiddleAd].filter(Boolean) as SidebarAdCard[];
    currentAds.forEach((ad) => {
      if (!ad?.id || adImpressionsRef.current.has(ad.id)) return;
      adImpressionsRef.current.add(ad.id);
      CommunityService.recordAdImpression(ad.id).catch(() => null);
    });
  }, [sidebarTopAd, sidebarFeaturedAd, sidebarMiddleAd]);

  const handleFollow = async (target: ProfileCard) => {
    if (!user) return;
    if (followingIds.has(target.id)) return;
    setFollowingIds((prev) => new Set(prev).add(target.id));
    try {
      await CommunityService.followTarget({ targetType: 'user', targetId: target.id });
      void RecoService.submitFeedback({
        surface: 'who_to_follow',
        entityType: target.entityType || 'freelancer',
        entityId: target.id,
        action: 'follow'
      }).catch(() => null);
      showNotification('success', 'Following', `You are now following ${target.name}.`);
    } catch (error: any) {
      console.error('Follow failed', error);
      setFollowingIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      if (isUnauthorizedError(error)) {
        if (confirm('Your session has expired. Log in to continue following users?')) {
          window.location.href = '/auth/login';
        }
        return;
      }
      showNotification('error', 'Follow failed', getApiErrorMessage(error, 'Unable to follow this profile.'));
    }
  };

  const handlePageFollow = async (page: RecommendedPageCard) => {
    if (!user) {
      if (confirm('Log in to follow pages?')) window.location.href = '/auth/login';
      return;
    }
    if (!page.id || pagesFollowBusy[page.id]) return;

    const pageId = page.id;
    const wasFollowing = Boolean(page.isFollowing);
    const previousFollowId = page.followId || null;

    setPagesFollowBusy((prev) => ({ ...prev, [pageId]: true }));
    setRecommendedPages((current) =>
      current.map((entry) =>
        entry.id === pageId
          ? {
              ...entry,
              isFollowing: !wasFollowing,
              followersCount: Math.max(0, (entry.followersCount || 0) + (wasFollowing ? -1 : 1))
            }
          : entry
      )
    );

    try {
      if (wasFollowing) {
        let followId = previousFollowId;
        if (!followId) {
          const followingData = await CommunityService.listFollowing('me');
          const pages = Array.isArray(followingData?.pages) ? followingData.pages : [];
          const match = pages.find((entry: any) => String(entry?.id || '') === pageId);
          followId = match?.followId || match?.follow_id || null;
        }
        if (!followId) {
          throw new Error('Unable to locate page follow record.');
        }
        await CommunityService.unfollowTarget(followId);
        setRecommendedPages((current) =>
          current.map((entry) => (entry.id === pageId ? { ...entry, followId: null, isFollowing: false } : entry))
        );
        showNotification('success', 'Pages', `Unfollowed ${page.name}.`);
      } else {
        const response = await CommunityService.followTarget({ targetType: 'page', targetId: pageId });
        const followId = response?.id || response?.data?.id || null;
        void RecoService.submitFeedback({
          surface: 'member_home',
          entityType: 'page',
          entityId: pageId,
          action: 'follow'
        }).catch(() => null);
        setRecommendedPages((current) =>
          current.map((entry) =>
            entry.id === pageId ? { ...entry, followId, isFollowing: true } : entry
          )
        );
        showNotification('success', 'Pages', `Now following ${page.name}.`);
      }
    } catch (error: any) {
      setRecommendedPages((current) =>
        current.map((entry) =>
          entry.id === pageId
            ? {
                ...entry,
                isFollowing: wasFollowing,
                followId: previousFollowId,
                followersCount: Math.max(0, (entry.followersCount || 0) + (wasFollowing ? 1 : -1))
              }
            : entry
        )
      );
      if (isUnauthorizedError(error)) {
        if (confirm('Your session has expired. Log in to continue following pages?')) {
          window.location.href = '/auth/login';
        }
        return;
      }
      showNotification('error', 'Pages', getApiErrorMessage(error, 'Unable to update page follow status.'));
    } finally {
      setPagesFollowBusy((prev) => ({ ...prev, [pageId]: false }));
    }
  };

  const handleSidebarAdClick = async (ad: SidebarAdCard) => {
    if (!ad?.id) return;
    try {
      await CommunityService.recordAdClick(ad.id);
    } catch {
      // no-op: click tracking should never block navigation
    }
    const destination = ad.destinationUrl || '/my-ads';
    window.open(destination, '_blank', 'noopener,noreferrer');
  };

  const togglePostFollow = async (targetId: string, targetName?: string) => {
    if (!targetId) return;
    if (!user) {
      if (confirm('Log in to follow users?')) window.location.href = '/auth/login';
      return;
    }
    if (String(user.id) === String(targetId)) return;
    if (followBusy[targetId]) return;
    setFollowBusy(prev => ({ ...prev, [targetId]: true }));
    try {
      const existing = followingMap[targetId];
      if (existing) {
        let followId = existing.followId;
        if (!followId) {
          const data = await CommunityService.listFollowing('me');
          const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
          const match = users.find((entry: any) => String(entry.id || entry.userId || entry.user_id) === String(targetId));
          followId = match?.followId || match?.follow_id;
        }
        if (!followId) {
          showNotification('error', 'Unfollow failed', 'Unable to locate follow record.');
          return;
        }
        await CommunityService.unfollowTarget(followId);
        setFollowingMap(prev => {
          const next = { ...prev };
          delete next[targetId];
          return next;
        });
        setFollowingIds(prev => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
        showNotification('success', 'Unfollowed', `You are no longer following ${targetName || 'this user'}.`);
      } else {
        const response = await CommunityService.followTarget({ targetType: 'user', targetId });
        const followId = response?.id || response?.followId || response?.follow_id;
        setFollowingMap(prev => ({ ...prev, [targetId]: { followId } }));
        setFollowingIds(prev => new Set(prev).add(targetId));
        showNotification('success', 'Following', `You are now following ${targetName || 'this user'}.`);
      }
    } catch (error: any) {
      if (isUnauthorizedError(error)) {
        if (confirm('Your session has expired. Log in to continue following users?')) {
          window.location.href = '/auth/login';
        }
        return;
      }
      showNotification('error', 'Follow failed', getApiErrorMessage(error, 'Unable to update follow status.'));
    } finally {
      setFollowBusy(prev => ({ ...prev, [targetId]: false }));
    }
  };

  const handleMessage = async (target: ProfileCard) => {
    if (!user) return;
    try {
      const id = await MessagingService.createConversation([
        { id: user.id, name: user.name || 'You', avatar: resolvedUserAvatar || undefined, role: user.role },
        { id: target.id, name: target.name, avatar: target.avatar || undefined }
      ]);
      window.location.href = `/messages/${id}`;
    } catch (error) {
      console.error('Message failed', error);
      showNotification('error', 'Message failed', 'Unable to start a conversation.');
    }
  };

  const markListingImageError = useCallback((imageKey: string) => {
    setListingImageErrors((prev) => (prev[imageKey] ? prev : { ...prev, [imageKey]: true }));
  }, []);

  const openScrolithaFromMemberHome = useCallback(
    (prompt: string) => {
      const params = new URLSearchParams(location.search);
      ['post', 'postId', 'story', 'storyId', 'scroll', 'edit', 'modal', 'focus'].forEach((key) => {
        params.delete(key);
      });
      const query = params.toString();
      const base = `${location.pathname}${query ? `?${query}` : ''}`;
      navigate(buildScrolithaPath(base, prompt));
    },
    [location.pathname, location.search, navigate]
  );

  const renderInlineListingCard = useCallback(
    (entry: { kind: 'job' | 'gig'; item: any }, slotIndex: number) => {
      const listingId = String(entry?.item?.id || '').trim();
      if (!listingId) return null;

      if (entry.kind === 'job') {
        const job = entry.item as any;
        const contactId = String(job?.clientId || '').trim();
        const contactName = String(job?.clientName || 'Employer').trim() || 'Employer';
        const canContact = Boolean(contactId);
        const listingImageKey = `job:${listingId}`;
        const listingImageUrl = resolveListingImageUrl(job);
        const hasListingImage = Boolean(listingImageUrl) && !listingImageErrors[listingImageKey];
        return (
          <article
            key={`feed_listing_job_${slotIndex}_${listingId}`}
            className="rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600">Featured Job</p>
              {job?.isFeatured ? (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">Promoted</span>
              ) : null}
            </div>
            <Link to={`/jobs/${encodeURIComponent(listingId)}`} className="mt-2 block">
              <p className="text-base font-semibold text-slate-900 line-clamp-2">{job?.title || 'Job opportunity'}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>{contactName}</span>
                {isClientVerified(job) ? (
                  <VerifiedBadge
                    size={16}
                    level={getClientVerificationLevel(job)}
                    className="ml-1"
                    subjectRole="employer"
                    subjectType={(job as any)?.clientType || 'business'}
                  />
                ) : null}
                <ProBadge role="employer" isPro={job?.clientIsPro} />
                {job?.category ? <span>- {job.category}</span> : null}
              </p>
              <p className="mt-2 text-sm text-slate-600">Budget: {formatListingAmount(job?.budget)}</p>
            </Link>
            <RecoSignalChips
              reasons={resolveListingFitReasons(job, 'job')}
              whyRecommended="Matched from live hiring demand for your professional graph."
              className="mt-2"
            />
            <div className="mt-3 rounded-2xl border border-indigo-100 bg-white/80 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700">Scrolitha recommendation</p>
                <button
                  type="button"
                  onClick={() =>
                    openScrolithaFromMemberHome(
                      buildListingScrolithaPrompt('job', String(job?.title || ''), String(job?.category || ''))
                    )
                  }
                  className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 transition hover:bg-indigo-100"
                >
                  Enhance copy
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-600">Optimize title, clarity, and action intent for stronger applications.</p>
            </div>
            <Link to={`/jobs/${encodeURIComponent(listingId)}`} className="mt-3 block overflow-hidden rounded-2xl border border-indigo-100 bg-white">
              {hasListingImage ? (
                <img
                  src={listingImageUrl}
                  alt={job?.title || 'Featured job'}
                  className="h-48 w-full object-cover"
                  loading="lazy"
                  onError={() => markListingImageError(listingImageKey)}
                />
              ) : (
                <div className="flex h-40 w-full items-center justify-center gap-2 bg-gradient-to-br from-indigo-100 via-white to-slate-50 text-indigo-500">
                  <ImageIcon className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Job image</span>
                </div>
              )}
            </Link>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Link
                to={`/jobs/${encodeURIComponent(listingId)}`}
                className="rounded-full border border-slate-200 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-700"
              >
                View
              </Link>
              <Link
                to={`/jobs/${encodeURIComponent(listingId)}?intent=apply`}
                className="rounded-full bg-slate-900 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-white"
              >
                Apply
              </Link>
              <button
                type="button"
                disabled={!canContact}
                onClick={() =>
                  canContact
                    ? handleMessage({
                        id: contactId,
                        name: contactName,
                        avatar: job?.clientAvatar || null,
                        subtitle: 'Employer'
                      })
                    : undefined
                }
                className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Contact
              </button>
            </div>
          </article>
        );
      }

      const gig = entry.item as any;
      const contactId = String(gig?.freelancerId || '').trim();
      const contactName = String(gig?.freelancerName || 'Freelancer').trim() || 'Freelancer';
      const canContact = Boolean(contactId);
      const listingImageKey = `gig:${listingId}`;
      const listingImageUrl = resolveListingImageUrl(gig);
      const hasListingImage = Boolean(listingImageUrl) && !listingImageErrors[listingImageKey];
      return (
        <article
          key={`feed_listing_gig_${slotIndex}_${listingId}`}
          className="rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">Featured Gig</p>
            {gig?.isFeatured ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Promoted</span>
            ) : null}
          </div>
          <Link to={`/gigs/${encodeURIComponent(listingId)}`} className="mt-2 block">
            <p className="text-base font-semibold text-slate-900 line-clamp-2">{gig?.title || 'Service offer'}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>{contactName}</span>
              {isFreelancerVerified(gig) ? (
                <VerifiedBadge
                  size={16}
                  level={getFreelancerVerificationLevel(gig)}
                  className="ml-1"
                  subjectRole="freelancer"
                  subjectType={(gig as any)?.freelancerType || 'user'}
                />
              ) : null}
              <ProBadge role="freelancer" isPro={gig?.freelancerIsPro} />
              {gig?.category ? <span>- {gig.category}</span> : null}
            </p>
            <p className="mt-2 text-sm text-slate-600">From {formatListingAmount(gig?.price, '$0')}</p>
          </Link>
          <RecoSignalChips
            reasons={resolveListingFitReasons(gig, 'gig')}
            whyRecommended="Matched from marketplace demand aligned to your network signals."
            className="mt-2"
          />
          <div className="mt-3 rounded-2xl border border-emerald-100 bg-white/80 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Scrolitha recommendation</p>
              <button
                type="button"
                onClick={() =>
                  openScrolithaFromMemberHome(
                    buildListingScrolithaPrompt('gig', String(gig?.title || ''), String(gig?.category || ''))
                  )
                }
                className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-100"
              >
                Enhance copy
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-600">Refine offer positioning and trust signals for better conversion.</p>
          </div>
          <Link to={`/gigs/${encodeURIComponent(listingId)}`} className="mt-3 block overflow-hidden rounded-2xl border border-emerald-100 bg-white">
            {hasListingImage ? (
              <img
                src={listingImageUrl}
                alt={gig?.title || 'Featured gig'}
                className="h-48 w-full object-cover"
                loading="lazy"
                onError={() => markListingImageError(listingImageKey)}
              />
            ) : (
              <div className="flex h-40 w-full items-center justify-center gap-2 bg-gradient-to-br from-emerald-100 via-white to-slate-50 text-emerald-600">
                <ImageIcon className="h-5 w-5" />
                <span className="text-xs font-semibold uppercase tracking-wide">Gig image</span>
              </div>
            )}
          </Link>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Link
              to={`/gigs/${encodeURIComponent(listingId)}`}
              className="rounded-full border border-slate-200 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-700"
            >
              View
            </Link>
            <Link
              to={`/gigs/${encodeURIComponent(listingId)}?intent=buy`}
              className="rounded-full bg-slate-900 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-white"
            >
              Buy
            </Link>
            <button
              type="button"
              disabled={!canContact}
              onClick={() =>
                canContact
                  ? handleMessage({
                      id: contactId,
                      name: contactName,
                      avatar: gig?.freelancerAvatar || null,
                      subtitle: 'Freelancer'
                    })
                  : undefined
              }
              className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Contact
            </button>
          </div>
        </article>
      );
    },
    [handleMessage, listingImageErrors, markListingImageError]
  );

  const renderAttachments = (post: any, attachments?: FeedPost['attachments']) => {
    const postId = String(post?.id || '').trim();
    if (!postId) return null;
    if (!attachments?.length) return null;
    const isSingleAttachment = attachments.length === 1;
    const mediaPreviewHeightClass = isSingleAttachment ? FEED_SINGLE_MEDIA_HEIGHT_CLASS : FEED_MULTI_MEDIA_HEIGHT_CLASS;
    return (
      <GraphicWarningGate
        active={Boolean(post?.graphicWarning)}
        revealed={Boolean(revealedGraphicPosts[postId])}
        onReveal={() => setRevealedGraphicPosts((prev) => ({ ...prev, [postId]: true }))}
        label={GRAPHIC_WARNING_LABEL}
        className="mt-3"
      >
        <div className={`grid gap-3 ${isSingleAttachment ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
          {attachments.map((media) => {
            const type = inferMediaType(media || {});
            const mediaKey = String(media.id || media.url || '');
            const mediaUrl = String(resolvePostAttachmentMediaUrl(media) || (media as any)?.url || '').trim();
            const posterUrl = String(resolvePostAttachmentPosterUrl(media) || (media as any)?.thumbnailUrl || '').trim();
            const durationLabel = formatMediaDuration((media as any)?.duration);
            if (!mediaUrl && type !== 'document') return null;
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
                  className="group relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left"
                >
                  <InlineAutoplayVideo
                    src={mediaUrl}
                    poster={posterUrl || undefined}
                    className={`${mediaPreviewHeightClass} w-full object-cover`}
                    controls={false}
                    loop
                    autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY}
                    preload="metadata"
                    loadingLabel="Video loading"
                  />
                  {durationLabel && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {durationLabel}
                    </span>
                  )}
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
                  className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left"
                >
                  <OptimizedImage
                    src={posterUrl || mediaUrl}
                    fallbackSrc={mediaUrl}
                    alt={media.name || 'Post media'}
                    width={640}
                    height={400}
                    sizes="(max-width: 1024px) 100vw, 640px"
                    className={`${mediaPreviewHeightClass} w-full object-cover`}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              );
            }
            const isPdf =
              String(media.mimeType || '').toLowerCase() === 'application/pdf' ||
              mediaUrl.toLowerCase().endsWith('.pdf');
            return (
              <button
                key={media.id || media.url}
                type="button"
                onClick={() => handlePostMediaPrimaryAction(post, media)}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left text-xs text-slate-600 hover:bg-slate-100"
              >
                <p className="truncate font-semibold text-slate-700">{media.name || media.url?.split('/').pop() || 'Attachment'}</p>
                <p className="mt-1 text-[11px] text-slate-500">{isPdf ? 'PDF document' : 'Document'}</p>
              </button>
            );
          })}
        </div>
      </GraphicWarningGate>
    );
  };

  const openDesktopComposer = useCallback(
    (intent: DesktopComposerIntent = 'text') => {
      if (!showComposer) return;
      // Restore session draft if the current composer is empty.
      const existingMeaningful = isComposerDraftMeaningful({
        title: postDraft.title,
        content: postDraft.content,
        topic: postDraft.topic,
        location: postDraft.location,
        region: postDraft.region
      });
      if (!existingMeaningful) {
        const saved = loadComposerDraft(composerDraftKey);
        if (saved) {
          setPostDraft((prev) => ({
            ...prev,
            title: saved.title ?? prev.title,
            content: saved.content ?? prev.content,
            tags: saved.tags ?? prev.tags,
            mentions: saved.mentions ?? prev.mentions,
            topic: saved.topic ?? prev.topic,
            region: saved.region ?? prev.region,
            location: saved.location ?? prev.location,
            visibility: (saved.visibility as PostDraft['visibility']) || prev.visibility,
            commentPolicy: (saved.commentPolicy as PostDraft['commentPolicy']) || prev.commentPolicy,
            graphicWarning:
              typeof saved.graphicWarning === 'boolean' ? saved.graphicWarning : prev.graphicWarning,
            isAIEnhanced: typeof saved.isAIEnhanced === 'boolean' ? saved.isAIEnhanced : prev.isAIEnhanced,
            aiInsightPreference: resolvePostAiInsightPreference(
              saved.aiInsightPreference,
              prev.aiInsightPreference
            )
          }));
          if (saved.authorScopeId) setPostAuthorScopeId(saved.authorScopeId);
          setComposerDraftNotice('Restored your unfinished draft from this session.');
        }
      }
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setDesktopComposerIntent(intent);
      setDesktopComposerOpen(true);
    },
    [composerDraftKey, postDraft.content, postDraft.location, postDraft.region, postDraft.title, postDraft.topic, showComposer]
  );

  const closeDesktopComposer = useCallback(() => {
    // Do not dismiss mid-publish (guard + UI busy state).
    if (postingRef.current || publishGuardRef.current.isBusy()) return;
    // Persist draft safely on close (text/settings only) from latest refs —
    // callback identity stays stable so ComposerShell never re-inits the focus trap mid-typing.
    const draft = postDraftRef.current;
    saveComposerDraft(composerDraftKeyRef.current, {
      title: draft.title,
      content: draft.content,
      tags: draft.tags,
      mentions: draft.mentions,
      topic: draft.topic,
      region: draft.region,
      location: draft.location,
      visibility: draft.visibility,
      commentPolicy: draft.commentPolicy,
      graphicWarning: draft.graphicWarning,
      isAIEnhanced: draft.isAIEnhanced,
      aiInsightPreference: draft.aiInsightPreference,
      authorScopeId: postAuthorScopeIdRef.current
    });
    setDesktopComposerOpen(false);
    setPostLocationPickerOpen(false);
  }, []);

  const discardComposerDraft = useCallback(() => {
    if (posting || publishGuardRef.current.isBusy()) return;
    postDraft.media.forEach((item) => revokePreviewUrl(item.url));
    postMediaCountRef.current = 0;
    postMediaItemsRef.current = [];
    setPostDraft(createEmptyPostDraft());
    setPostLocationDetails(null);
    setPostLocationPickerOpen(false);
    setComposerDraftNotice(null);
    clearComposerDraft(composerDraftKey);
    setComposerStatusMessage('Draft discarded.');
  }, [composerDraftKey, postDraft.media, posting]);

  const focusComposer = useCallback(() => {
    openDesktopComposer('text');
  }, [openDesktopComposer]);

  const handlePostAuthorScopeChange = useCallback((nextValue: string) => {
    setPostAuthorScopeId(nextValue);
    setPostDraft((prev) => (prev.offerTags.length ? { ...prev, offerTags: [] } : prev));
  }, []);

  const handlePostLocationDetailsChange = useCallback((nextValue: Partial<StructuredLocationFields>) => {
    setPostLocationDetails((prev) => {
      const merged = { ...(prev || {}), ...(nextValue || {}) };
      const nextLabel = getStructuredLocationLabel(merged);
      setPostDraft((current) => ({
        ...current,
        location: nextLabel || String(current.location || '').trim()
      }));
      return merged;
    });
  }, []);

  const renderDesktopComposer = useCallback(() => {
    if (!showComposer) return null;

    const publishBlocked =
      posting ||
      postDraft.media.some((item) => item.uploading) ||
      postDraft.media.some((item) => item.error) ||
      (!postDraft.title.trim() &&
        !postDraft.content.trim() &&
        !postDraft.media.some((item) => item.id));

    return (
      <>
        <div ref={composerRef} className={`mt-4 ${composerEntryCard}`}>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 sm:h-14 sm:w-14">
              {resolvedUserAvatar ? (
                <OptimizedImage
                  src={resolvedUserAvatar}
                  alt={user.name || 'User'}
                  width={128}
                  height={128}
                  sizes="56px"
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <Users className="mx-auto mt-3.5 h-5 w-5 text-slate-400 sm:mt-4" aria-hidden="true" />
              )}
            </div>
            <button
              type="button"
              onClick={() => openDesktopComposer('text')}
              className={composerEntryTrigger}
              aria-haspopup="dialog"
            >
              Start a post
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => openDesktopComposer('video')} className={composerEntryShortcut}>
              <Video className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              Video
            </button>
            <button type="button" onClick={() => openDesktopComposer('photo')} className={composerEntryShortcut}>
              <ImageIcon className="h-4 w-4 text-sky-600" aria-hidden="true" />
              Photo
            </button>
            <button type="button" onClick={() => openDesktopComposer('article')} className={composerEntryShortcut}>
              <FileText className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Write article
            </button>
          </div>
          {composerDraftNotice ? (
            <div className={`mt-3 ${composerDraftBanner}`} role="status">
              <span>{composerDraftNotice}</span>
              <button type="button" onClick={discardComposerDraft} className="text-xs font-semibold underline">
                Discard draft
              </button>
            </div>
          ) : null}
        </div>

        <ComposerShell
          open={desktopComposerOpen}
          title="Create a post"
          onClose={closeDesktopComposer}
          statusMessage={composerStatusMessage}
          header={
            <>
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 sm:h-14 sm:w-14">
                  {activePostAuthor.avatarUrl ? (
                    <img
                      src={activePostAuthor.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      width={56}
                      height={56}
                    />
                  ) : (
                    <Users className="h-5 w-5 text-slate-400" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Posting as</p>
                  <p className="truncate text-base font-semibold text-slate-950 sm:text-lg">{activePostAuthor.label}</p>
                  <p className="truncate text-sm text-slate-500">
                    {activePostAuthor.subtitle} · {composerTitle}
                  </p>
                </div>
              </div>
              <div className="flex w-full min-w-0 flex-wrap items-start gap-2 sm:w-auto sm:min-w-[240px] sm:flex-nowrap">
                <label className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 sm:px-4">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Identity
                  </span>
                  <select
                    value={postAuthorScopeId}
                    onChange={(event) => handlePostAuthorScopeChange(event.target.value)}
                    className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                    aria-label="Posting identity"
                  >
                    {desktopPostAuthorOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                        {option.type === 'page' ? ' — Page' : ' — Personal'}
                      </option>
                    ))}
                  </select>
                  {ownedBusinessPagesLoading ? (
                    <span className="mt-1 block text-[11px] text-slate-500">Loading your pages…</span>
                  ) : null}
                </label>
                <label className="min-w-[8.5rem] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Audience
                  </span>
                  <select
                    value={postDraft.visibility}
                    onChange={(event) =>
                      setPostDraft((prev) => ({
                        ...prev,
                        visibility: event.target.value as PostDraft['visibility']
                      }))
                    }
                    className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                    aria-label="Audience"
                  >
                    <option value="public">Public</option>
                    <option value="network">Network</option>
                    <option value="friends">Friends</option>
                    <option value="private">Private</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={closeDesktopComposer}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                  aria-label="Close create post dialog"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </>
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => postMediaInputRef.current?.click()}
                  className={composerToolbarBtn}
                  aria-label="Add media from device"
                >
                  <Video className="h-4 w-4" aria-hidden="true" />
                  Media
                </button>
                <button type="button" onClick={startCamera} className={composerToolbarBtn} aria-label="Open camera">
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  Camera
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={closeDesktopComposer}
                  className={composerSecondaryBtn}
                  disabled={posting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handlePostSubmit()}
                  disabled={publishBlocked}
                  className={composerPrimaryBtn}
                  aria-busy={posting}
                >
                  {posting ? 'Publishing…' : 'Publish'}
                </button>
              </div>
            </div>
          }
        >
          <div
            className="mx-auto max-w-3xl space-y-4"
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDrop={handleComposerDrop}
            onPaste={handleComposerPaste}
          >
            {composerDraftNotice ? (
              <div className={composerDraftBanner} role="status">
                <span>{composerDraftNotice}</span>
                <button type="button" onClick={discardComposerDraft} className="text-xs font-semibold underline">
                  Discard draft
                </button>
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
              <MentionHashtagTextarea
                ref={composerInputRef}
                value={postDraft.content}
                onChange={(nextValue) => setPostDraft((prev) => ({ ...prev, content: nextValue }))}
                placeholder="What do you want to talk about?"
                mentionsEnabled={mentionsEnabled}
                hashtagsEnabled={hashtagsEnabled}
                className={composerEditor}
              />
              <div className="mt-3">
                <div className="flex flex-wrap gap-2">
                  {postAiActions.map((action) => (
                    <button
                      key={action.mode}
                      type="button"
                      onClick={() => void runPostAi(action.mode)}
                      disabled={aiLoading || posting}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {aiRunningMode === action.mode && aiLoading ? 'Working...' : action.label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-slate-500">
                  {hashtagsEnabled ? '#tags' : '#tags (disabled by admin)'} and{' '}
                  {mentionsEnabled ? '@mentions' : '@mentions (disabled by admin)'} supported. AI suggestions never
                  publish without your approval. Drag and drop or paste images to attach.
                </p>
              </div>
            </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          ref={postTitleInputRef}
                          value={postDraft.title}
                          onChange={(event) => setPostDraft((prev) => ({ ...prev, title: event.target.value }))}
                          placeholder="Post title (optional)"
                          className={composerField}
                        />
                        <select
                          value={postDraft.commentPolicy}
                          onChange={(event) =>
                            setPostDraft((prev) => ({
                              ...prev,
                              commentPolicy: event.target.value as PostDraft['commentPolicy']
                            }))
                          }
                          className={composerField}
                          aria-label="Who can comment"
                        >
                          {commentPolicyOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Topic
                          </span>
                          <input
                            value={postDraft.topic}
                            onChange={(event) => setPostDraft((prev) => ({ ...prev, topic: event.target.value }))}
                            list="member_home_topics"
                            placeholder="Topic (optional)"
                            className="mt-2 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                          />
                        </label>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Region
                          </span>
                          <select
                            value={postDraft.region}
                            onChange={(event) => {
                              const nextRegion = event.target.value;
                              setPostDraft((prev) => {
                                const currentLocation = String(prev.location || '').trim();
                                const previousRegion = String(prev.region || '').trim();
                                const nextLocation =
                                  !currentLocation || currentLocation === previousRegion
                                    ? nextRegion
                                    : currentLocation;
                                return {
                                  ...prev,
                                  region: nextRegion,
                                  location: nextLocation
                                };
                              });
                            }}
                            className="mt-2 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                          >
                            <option value="">Select region (optional)</option>
                            {regions.map((region) => (
                              <option key={region} value={region}>
                                {region}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">Location</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {postLocationSummary || 'Use map search or current location to enrich this post.'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPostLocationPickerOpen((prev) => !prev)}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                              {postLocationPickerOpen ? 'Hide map' : postLocationSummary ? 'Edit with map' : 'Auto-detect with map'}
                            </button>
                          </div>
                          <input
                            value={postDraft.location}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setPostDraft((prev) => ({ ...prev, location: nextValue }));
                              setPostLocationDetails(null);
                            }}
                            list="member_home_locations"
                            placeholder={user?.location || user?.country || 'Location (optional)'}
                            className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                          />
                          {postLocationPickerOpen ? (
                            <div className="mt-4">
                              <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">Loading map picker...</div>}>
                                <LocationPicker
                                  value={postLocationDetails}
                                  onChange={handlePostLocationDetailsChange}
                                  label="Integrated map location"
                                  placeholder="Search city, area, or place"
                                />
                              </Suspense>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <OfferTagSelector
                        mode={activePostBusinessPageId ? 'business' : 'user'}
                        ownerUserId={activePostBusinessPageId ? undefined : user?.id}
                        businessPageId={activePostBusinessPageId}
                        value={postDraft.offerTags}
                        onChange={(nextValue) => setPostDraft((prev) => ({ ...prev, offerTags: nextValue }))}
                        label={activePostBusinessPageId ? 'Tag page offers' : 'Tag storefront offers'}
                        helperText={
                          activePostBusinessPageId
                            ? "Attach this page's offers so viewers can open the page storefront or start a brief without leaving the post."
                            : 'Attach relevant services so viewers can open your storefront, message you, or start a brief without leaving the post.'
                        }
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="grid gap-3">
                        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
                          <input
                            type="checkbox"
                            checked={postDraft.graphicWarning}
                            onChange={(event) =>
                              setPostDraft((prev) => ({ ...prev, graphicWarning: event.target.checked }))
                            }
                          />
                          <span className="inline-flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            {GRAPHIC_WARNING_LABEL}
                          </span>
                        </label>
                        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
                          <input
                            type="checkbox"
                            checked={postDraft.isAIEnhanced}
                            onChange={(event) =>
                              setPostDraft((prev) => ({ ...prev, isAIEnhanced: event.target.checked }))
                            }
                          />
                          <span className="inline-flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-emerald-600" />
                            Mark as AI-enhanced
                          </span>
                        </label>
                        <label className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Scrolitha AI insight
                          </span>
                          <select
                            value={postDraft.aiInsightPreference}
                            onChange={(event) =>
                              setPostDraft((prev) => ({
                                ...prev,
                                aiInsightPreference: resolvePostAiInsightPreference(event.target.value, 'auto')
                              }))
                            }
                            className="mt-2 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                          >
                            <option value="auto">Automatic</option>
                            <option value="on">Generate for this post</option>
                            <option value="off">Do not generate</option>
                          </select>
                        </label>
                      </div>

                      {postDraft.media.length > 0 ? (
                        <div className="grid gap-3">
                          {postDraft.media.map((media) => {
                            const type = media.type || inferMediaType(media);
                            const durationLabel = formatMediaDuration(media.duration);
                            return (
                              <div
                                key={media.localId}
                                className={composerAttachmentTile}
                              >
                                <button
                                  type="button"
                                  onClick={() => handlePostMediaRemove(media.localId)}
                                  className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-1.5 text-slate-500 shadow-sm hover:text-slate-700"
                                  aria-label={`Remove attachment ${media.name || ''}`.trim()}
                                >
                                  <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                                {type === 'video' ? (
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setPreviewMedia(toPreviewMedia(media))}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        setPreviewMedia(toPreviewMedia(media));
                                      }
                                    }}
                                    className="relative block h-48 w-full cursor-pointer overflow-hidden"
                                  >
                                    <InlineAutoplayVideo
                                      src={resolvePostAttachmentMediaUrl(media) || resolveAssetUrl(media.url) || ''}
                                      poster={resolvePostAttachmentPosterUrl(media) || resolveAssetUrl(media.thumbnailUrl) || undefined}
                                      className="h-48 w-full object-cover"
                                      controls={false}
                                      loop
                                      autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY}
                                      preload="metadata"
                                      loadingLabel="Video preview loading"
                                    />
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent px-4 pb-3 pt-10">
                                      <div className="inline-flex rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-900 shadow-sm">
                                        Autoplay preview
                                      </div>
                                    </div>
                                    {durationLabel ? (
                                      <span className="absolute bottom-3 right-3 rounded bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">
                                        {durationLabel}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : type === 'image' ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewMedia(toPreviewMedia(media))}
                                    className="block h-48 w-full"
                                  >
                                    <OptimizedImage
                                      src={resolvePostAttachmentPosterUrl(media) || resolveAssetUrl(media.thumbnailUrl || media.url) || ''}
                                      fallbackSrc={resolvePostAttachmentMediaUrl(media) || resolveAssetUrl(media.url) || ''}
                                      alt={media.name || 'Post media'}
                                      width={960}
                                      height={540}
                                      sizes="(max-width: 1280px) 100vw, 420px"
                                      className="h-48 w-full object-cover"
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewMedia(toPreviewMedia(media))}
                                    className="flex h-40 w-full flex-col items-center justify-center p-4 text-xs text-slate-500"
                                  >
                                    <FileText className="mb-2 h-6 w-6 text-slate-400" />
                                    {media.name || 'Attachment'}
                                  </button>
                                )}
                                {media.uploading ? (
                                  <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-xs font-semibold text-slate-600">
                                    Uploading {media.progress ?? 0}%
                                  </div>
                                ) : null}
                                {media.error ? (
                                  <div className="absolute inset-x-0 bottom-0 bg-red-50 px-3 py-2 text-[10px] text-red-600">
                                    {media.error}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center text-sm text-slate-500">
                          Add media to make your post richer across desktop and mobile.
                        </div>
                      )}
                    </div>
                  </div>

                  <datalist id="member_home_topics">
                    {topics.slice(0, 500).map((topic) => (
                      <option key={topic} value={topic} />
                    ))}
                  </datalist>
                  <datalist id="member_home_locations">
                    {regions.slice(0, 500).map((region) => (
                      <option key={region} value={region} />
                    ))}
                  </datalist>
          </div>
        </ComposerShell>
      </>
    );
  }, [
    activePostAuthor,
    activePostBusinessPageId,
    aiLoading,
    composerDraftNotice,
    composerStatusMessage,
    discardComposerDraft,
    handleComposerDrop,
    handleComposerPaste,
    handlePostSubmit,
    aiRunningMode,
    closeDesktopComposer,
    composerTitle,
    desktopComposerOpen,
    desktopPostAuthorOptions,
    handlePostAuthorScopeChange,
    handlePostLocationDetailsChange,
    handlePostMediaRemove,
    hashtagsEnabled,
    mentionsEnabled,
    openDesktopComposer,
    ownedBusinessPagesLoading,
    postAuthorScopeId,
    postDraft,
    postLocationDetails,
    postLocationPickerOpen,
    postLocationSummary,
    posting,
    postAiActions,
    regions,
    runPostAi,
    showComposer,
    startCamera,
    topics,
    resolvedUserAvatar,
    user?.country,
    user?.id,
    user?.location,
    user?.name
  ]);

  const routeToAuth = useCallback(
    (mode: 'login' | 'signup', action: 'project_brief' | 'gig_creation') => {
      const cleanPrompt = projectBriefPrompt.trim();
      if (action === 'project_brief' && cleanPrompt) {
        writePendingProjectPrompt(cleanPrompt);
      }
      const redirect =
        action === 'project_brief'
          ? encodeURIComponent('/create-job?mode=ai_draft')
          : encodeURIComponent('/create-gig?mode=ai');
      navigate(`/auth/${mode}?redirect=${redirect}&source=member_home_${action}`);
    },
    [navigate, projectBriefPrompt]
  );

  const handleFeaturedGigCreation = useCallback(() => {
    if (isGuest) {
      showNotification('warning', 'Login Required', 'Please login or register to continue with AI gig creation.');
      routeToAuth('login', 'gig_creation');
      return;
    }
    navigate('/create-gig?mode=ai');
  }, [isGuest, navigate, routeToAuth, showNotification]);

  const handleFeaturedProjectBrief = useCallback(async () => {
    const prompt = projectBriefPrompt.trim();
    if (!prompt) {
      showNotification('warning', 'Prompt Required', 'Please describe your project before building a brief.');
      return;
    }

    if (isGuest) {
      showNotification('warning', 'Login Required', 'Please login or register to build a project brief.');
      routeToAuth('login', 'project_brief');
      return;
    }

    setProjectBriefGenerating(true);
    try {
      const brief = await AIService.generateProjectBrief({ prompt });
      sessionStorage.setItem('ai_job_brief', JSON.stringify(brief));
      setProjectBriefOpen(false);
      showNotification('success', 'Brief Generated', 'Redirecting to job creation...');
      navigate('/create-job?mode=ai_draft');
    } catch (error) {
      console.error('Featured project brief generation failed:', error);
      showNotification('alert', 'Error', 'Could not generate brief. Please try again.');
    } finally {
      setProjectBriefGenerating(false);
    }
  }, [isGuest, navigate, projectBriefPrompt, routeToAuth, showNotification]);

  const focusFeedSection = useCallback(() => {
    if (typeof document === 'undefined') return;
    document.getElementById('member-home-feed-stream')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const openInsightsSection = useCallback((sectionId: string, group?: 'growth' | 'opportunity') => {
    if (typeof window !== 'undefined' && group) {
      window.dispatchEvent(
        new CustomEvent('insights:open_section', {
          detail: { group, section: sectionId }
        })
      );
    }
    if (typeof document === 'undefined') return;
    // Smooth in-page focus only — never assign window.location (full reload).
    window.setTimeout(() => {
      const target = document.querySelector(
        `[data-insights-section="${CSS.escape(String(sectionId || ''))}"]`
      ) as HTMLElement | null;
      if (!target) return;
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      try {
        target.focus({ preventScroll: true });
      } catch {
        /* optional focus */
      }
    }, group ? 120 : 0);
  }, []);

  const discoveryAd = sidebarFeaturedAd || sidebarTopAd || sidebarMiddleAd;

  const memberHomeHighlightPills = useMemo<MemberHomeHighlightPill[]>(() => {
    const pills: MemberHomeHighlightPill[] = [{ label: 'Posts', value: String(feedItems.length) }];
    if (jobs.length) pills.push({ label: 'Jobs', value: String(jobs.length) });
    if (gigs.length) pills.push({ label: 'Gigs', value: String(gigs.length) });
    if (officeHours.length) pills.push({ label: 'Live', value: String(officeHours.length) });
    if (featuredSeries.length) pills.push({ label: 'Series', value: String(featuredSeries.length) });
    if (broadcastChannels.length) pills.push({ label: 'Channels', value: String(broadcastChannels.length) });
    if (profiles.length || recommendedPages.length) {
      pills.push({ label: 'Network', value: String(profiles.length + recommendedPages.length) });
    }
    if (discoveryAd) pills.push({ label: 'Sponsored', value: '1' });
    return pills;
  }, [
    broadcastChannels.length,
    discoveryAd,
    featuredSeries.length,
    feedItems.length,
    gigs.length,
    jobs.length,
    officeHours.length,
    profiles.length,
    recommendedPages.length
  ]);

  const memberHomeHighlightItems = useMemo<MemberHomeHighlightItem[]>(() => {
    const items: MemberHomeHighlightItem[] = [];
    const topJob = jobs[0] as any;
    const topGig = gigs[0] as any;
    const topOfficeHour = officeHours[0];
    const topSeries = featuredSeries[0];
    const topBroadcastChannel = broadcastChannels[0];
    const topProfile = profiles[0];
    const topPage = recommendedPages[0];
    const topPost = feedItems[0];

    items.push({
      id: 'desktop-scrolitha-coach',
      eyebrow: 'Scrolitha coach',
      title: 'Improve posts, gigs, and briefs faster',
      // Compact coach copy — presentation uses a small brand mark, not a hero image.
      description: 'Polish drafts before you publish, package, or match.',
      meta: 'Posts · Gigs · Briefs',
      badge: 'AI',
      ctaLabel: 'Open coach',
      // SPA navigation via React Router — never full document reload.
      onClick: () => {
        openInsightsSection('scrolitha-coach', 'growth');
        openScrolithaFromMemberHome(
          'Help me improve my next post, gig package, or project brief with Scrolitha coach.'
        );
      },
      mediaUrl: '/logo.png',
      icon: <Sparkles className="h-3 w-3" />,
      tone: 'violet'
    });

    if (topJob) {
      items.push({
        id: `desktop-job:${topJob.id}`,
        eyebrow: 'Featured jobs',
        title: topJob.title || 'Recommended job',
        description: [topJob.clientName || 'Employer', topJob.category || 'Professional opportunity'].filter(Boolean).join(' · '),
        meta: `Budget: ${formatListingAmount(topJob?.budget)}`,
        badge: 'Live',
        ctaLabel: 'Browse jobs',
        href: topJob?.id ? `/jobs/${encodeURIComponent(topJob.id)}` : '/browse-jobs',
        mediaUrl: resolveListingImageUrl(topJob),
        icon: <Briefcase className="h-4 w-4" />,
        tone: 'blue'
      });
    }

    if (topGig) {
      items.push({
        id: `desktop-gig:${topGig.id}`,
        eyebrow: 'Featured gigs',
        title: topGig.title || 'Recommended gig',
        description: [topGig.freelancerName || 'Freelancer', topGig.category || 'Service listing'].filter(Boolean).join(' · '),
        meta: `From ${formatListingAmount(topGig?.price, 'Pricing available')}`,
        badge: 'Recommended',
        ctaLabel: 'Browse gigs',
        href: topGig?.id ? `/gigs/${encodeURIComponent(topGig.id)}` : '/browse',
        mediaUrl: resolveListingImageUrl(topGig),
        icon: <Sparkles className="h-4 w-4" />,
        tone: 'violet'
      });
    }

    if (topOfficeHour) {
      items.push({
        id: `desktop-office-hours:${topOfficeHour.id}`,
        eyebrow: 'Live AMAs / office hours',
        title: topOfficeHour.title || 'Upcoming office hours',
        description: topOfficeHour.description,
        meta: topOfficeHour.metaLabel,
        badge: topOfficeHour.badge,
        ctaLabel: topOfficeHour.isRegistered ? 'View session' : 'Open office hours',
        onClick: () => openInsightsSection('live-office-hours', 'opportunity'),
        mediaUrl: topOfficeHour.image || '',
        fallbackMediaUrl: '/logo.png',
        icon: <CalendarDays className="h-4 w-4" />,
        tone: 'amber'
      });
    }

    if (topSeries) {
      const featuredScroll = topSeries.featuredScroll || topSeries.previewItems?.[0] || topSeries.items?.[0]?.scroll || null;
      const media = featuredScroll?.media || (featuredScroll as any)?.Media || null;
      const poster =
        String(media?.thumbnailUrl || media?.thumbnail_url || media?.posterUrl || media?.poster_url || '').trim();
      const videoCandidate = String(
        media?.playbackUrl ||
          media?.playback_url ||
          media?.streamUrl ||
          media?.stream_url ||
          media?.url ||
          media?.src ||
          ''
      ).trim();
      const looksLikeVideo =
        Boolean(videoCandidate) &&
        (/\.(mp4|webm|mov|m4v|ogg)(?:$|[?#])/i.test(videoCandidate) ||
          videoCandidate.includes('/api/files/content/') ||
          String(media?.type || media?.mimeType || media?.mime_type || '').toLowerCase().includes('video'));
      items.push({
        id: `desktop-series:${topSeries.id}`,
        eyebrow: 'Series / playlists',
        title: topSeries.title || 'Bingeable Scroll series',
        description:
          topSeries.description ||
          featuredScroll?.description ||
          featuredScroll?.title ||
          'Creator-curated Scroll playlists keep the strongest work in sequence.',
        meta: `${topSeries.creator.name} · ${topSeries.itemCount} items`,
        badge: 'Series',
        ctaLabel: 'Open series',
        href: buildSeriesUrl(topSeries.id),
        mediaUrl: poster || videoCandidate || '',
        videoUrl: looksLikeVideo ? videoCandidate : null,
        posterUrl: poster || null,
        icon: <Video className="h-4 w-4" />,
        tone: 'rose'
      });
    }

    if (topBroadcastChannel) {
      items.push({
        id: `desktop-broadcast:${topBroadcastChannel.id}`,
        eyebrow: 'Broadcast updates',
        title: topBroadcastChannel.name || topBroadcastChannel.source?.name || 'Creator updates',
        description:
          topBroadcastChannel.latestUpdate?.content ||
          topBroadcastChannel.description ||
          'Follow creator and company updates without digging through the full feed.',
        meta: `${topBroadcastChannel.memberCount} followers · ${topBroadcastChannel.updateCount} updates`,
        badge: topBroadcastChannel.isFollowing ? 'Following' : 'Live',
        ctaLabel: 'Open source',
        href: String(topBroadcastChannel.source?.href || '').trim() || '/community',
        mediaUrl: topBroadcastChannel.source?.avatar || '',
        icon: <MessageCircle className="h-4 w-4" />,
        tone: 'emerald'
      });
    }

    if (topProfile || topPage) {
      const networkTitle = topProfile?.name || topPage?.name || 'Grow your network';
      const networkDescription =
        [topProfile?.name, topPage?.name].filter(Boolean).join(' · ') ||
        'Recommended people and pages are available directly on your member home.';
      items.push({
        id: 'desktop-network',
        eyebrow: 'Relationship intelligence',
        title: networkTitle,
        description: networkDescription,
        meta: `${profiles.length} people · ${recommendedPages.length} pages`,
        badge: 'Grow',
        reason: topProfile?.whyRecommended || topPage?.whyRecommended || 'Strengthen your professional graph',
        ctaLabel: topProfile ? 'View profile' : 'Open page',
        href: topProfile ? buildProfileUrl(topProfile) : topPage ? buildPageUrl(topPage) : undefined,
        mediaUrl: topProfile?.avatar || topPage?.avatar || '',
        icon: <Users className="h-4 w-4" />,
        tone: 'emerald'
      });
    }

    if (discoveryAd) {
      items.push({
        id: `desktop-ad:${discoveryAd.id}`,
        eyebrow: 'Sponsored',
        title: discoveryAd.title || 'Featured campaign',
        description: discoveryAd.body || 'Approved ad campaigns are supported directly on member home.',
        meta: 'Live campaign',
        badge: 'Sponsored',
        ctaLabel: discoveryAd.ctaText || 'Open campaign',
        onClick: () => handleSidebarAdClick(discoveryAd),
        mediaUrl: discoveryAd.mediaUrl || '',
        icon: <Star className="h-4 w-4" />,
        tone: 'amber'
      });
    } else if (topPost) {
      items.push({
        id: `desktop-post:${topPost.id}`,
        eyebrow: 'Feed intelligence',
        title: topPost.title || topPost.author?.displayName || topPost.authorName || 'Fresh from your network',
        description:
          String(topPost.content || 'Posts and community updates stay live and accessible directly from member home.').trim(),
        meta: `${feedItems.length} posts loaded`,
        badge: 'Fresh',
        reason: topPost.ranking?.primaryReason || 'Ranked for your current professional graph',
        ctaLabel: 'Open post',
        onClick: () => openPostCard(topPost),
        mediaUrl: resolveHighlightPostMedia(topPost),
        videoUrl: resolveHighlightPostVideo(topPost),
        posterUrl: resolveHighlightPostPoster(topPost),
        fallbackMediaUrl: resolveHighlightPostFallback(topPost),
        icon: <Compass className="h-4 w-4" />,
        tone: 'slate'
      });
    }

    return items.slice(0, 6);
  }, [
    broadcastChannels,
    buildSeriesUrl,
    buildPageUrl,
    buildProfileUrl,
    discoveryAd,
    feedItems,
    featuredSeries,
    gigs,
    handleSidebarAdClick,
    jobs,
    openPostCard,
    officeHours,
    openInsightsSection,
    openScrolithaFromMemberHome,
    profiles,
    recommendedPages
  ]);

  return (
    <section
      className="relative w-full min-w-0 bg-[#f3f2ef] py-5 sm:py-10 text-base sm:text-[17px] leading-relaxed"
      data-testid="scrolith-member-home"
    >
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute -top-24 left-[-8%] h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,#e0f2fe,transparent_70%)]" />
        <div className="absolute top-16 right-[-10%] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,#fef3c7,transparent_70%)]" />
      </div>

      <div className={enterprisePageShell} data-testid="scrolith-member-home-shell">
        <div className={`relative z-30 mb-6 overflow-visible flex flex-col gap-4 ${enterprisePanel} ${enterprisePanelPadding} bg-white/95 rise-fade`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 lg:flex-1">
              <p className={enterpriseWidgetTitle}>Home</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.85rem]">{content?.title || 'Grow your professional world'}</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600 sm:text-base">{content?.subtitle || 'Catch up on your network, opportunities, and community highlights.'}</p>
            </div>
            <div className="w-full lg:w-auto flex flex-col gap-3 sm:flex-row sm:items-center lg:justify-end">
              {showSearch && (
                <div ref={searchRef} className="relative z-[250] w-full max-w-full sm:flex-1 lg:w-[42rem]">
                  <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setSearchOpen(true);
                    }}
                    onFocus={() => setSearchOpen(true)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        performSearch(searchQuery);
                      }
                    }}
                    placeholder={searchPlaceholder}
                    className="h-12 sm:h-14 w-full rounded-full border border-slate-200 bg-white pl-12 pr-5 text-base sm:text-lg text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  />
                  {searchOpen && (
                    <div
                      className="absolute left-0 right-0 top-[calc(100%+0.625rem)] z-[300] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                      style={{ contain: 'layout paint' }}
                    >
                      <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
                        {searchHint}
                        {searchQuery.trim().length >= 2 && !searchLoading && searchResults.length > 0
                          ? ' (' + searchResults.length + ' result' + (searchResults.length === 1 ? '' : 's') + ')'
                          : ''}
                      </div>
                      <div className="max-h-[min(65vh,32rem)] overflow-y-auto overscroll-contain pb-2" style={{ scrollbarGutter: 'stable' }}>
                        {searchLoading ? (
                          <div className="px-4 py-3 text-sm text-slate-500">Searching...</div>
                        ) : searchSections.length === 0 ? (
                          <div className="px-3 py-3">
                            <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                              <Sparkles className="h-3.5 w-3.5" />
                              Scrolith embedded recommendations
                            </div>
                            <div className="space-y-1">
                              {searchRecommendationPrompts.map((prompt) => (
                                <button
                                  key={prompt.url}
                                  type="button"
                                  onClick={() => {
                                    setSearchOpen(false);
                                    navigate(prompt.url);
                                  }}
                                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                                >
                                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                                  <span className="truncate">{prompt.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          searchSections.map((section) => (
                            <div key={section.key} className="px-2 py-1">
                              <div className="sticky top-0 z-[1] flex items-center justify-between rounded-md bg-white/95 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
                                <span>{section.label}</span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                  {section.items.length}
                                </span>
                              </div>

                              {section.items.map((result, index) => {
                                const href = result.url || '#';
                                const typeKey = normalizeSearchType(result.type) || section.key;
                                const imageSrc = result.avatarUrl || result.image || null;
                                const subtitle =
                                  result.subtitle ||
                                  result.description ||
                                  result.excerpt ||
                                  (result.username ? `@${result.username}` : '') ||
                                  result.category ||
                                  section.label;
                                const itemNode = (
                                  <div className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50">
                                    <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-100">
                                      {imageSrc ? (
                                        <OptimizedImage
                                          src={resolveAssetUrl(imageSrc)}
                                          alt={result.title || result.name || section.label}
                                          width={96}
                                          height={96}
                                          sizes="48px"
                                          className="h-full w-full object-cover"
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      ) : typeKey === 'people' ? (
                                        <Users className="mx-auto mt-2.5 h-5 w-5 text-slate-500" />
                                      ) : typeKey === 'pages' ? (
                                        <Compass className="mx-auto mt-2.5 h-5 w-5 text-slate-500" />
                                      ) : typeKey === 'jobs' ? (
                                        <Briefcase className="mx-auto mt-2.5 h-5 w-5 text-slate-500" />
                                      ) : typeKey === 'marketplace' ? (
                                        <ShoppingBag className="mx-auto mt-2.5 h-5 w-5 text-slate-500" />
                                      ) : (
                                        <Sparkles className="mx-auto mt-2.5 h-5 w-5 text-slate-500" />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-semibold text-slate-800">{result.title || result.name}</p>
                                      <p className="truncate text-xs text-slate-500">{subtitle}</p>
                                    </div>
                                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase text-slate-500">
                                      {SEARCH_GROUP_BADGES[typeKey] || section.label}
                                    </span>
                                  </div>
                                );

                                const key = result.id || `${section.key}-${result.title || result.name || href}-${index}`;
                                if (href.startsWith('/')) {
                                  return (
                                    <button
                                      key={key}
                                      type="button"
                                      onClick={() => {
                                        setSearchOpen(false);
                                        navigate(href);
                                      }}
                                      className="block w-full text-left"
                                    >
                                      {itemNode}
                                    </button>
                                  );
                                }

                                return (
                                  <a key={key} href={href} target="_blank" rel="noreferrer" onClick={() => setSearchOpen(false)}>
                                    {itemNode}
                                  </a>
                                );
                              })}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={focusComposer}
                className="inline-flex h-12 sm:h-14 w-full sm:w-auto shrink-0 items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-white"
              >
                <Plus className="h-4 w-4" />
                Create
              </button>
            </div>
          </div>
        </div>

        <div className={enterpriseMemberHomeGrid} data-testid="scrolith-member-home-grid">
          <aside className={enterpriseLeftColumn} aria-label="Profile and shortcuts" data-testid="scrolith-member-home-left">
            {/*
              Profile identity card: cover stays clipped; panel allows overflow so the
              centered avatar can sit 40% over the cover bottom edge without clipping.
            */}
            <div
              className="rise-fade-delay-1 overflow-visible rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_8px_24px_-18px_rgba(15,23,42,0.18)]"
              data-testid="scrolith-member-home-profile-card"
            >
              <div className="relative">
                <div className="relative h-24 overflow-hidden rounded-t-2xl bg-gradient-to-r from-slate-900 via-slate-700 to-slate-600 sm:h-28">
                  {selfProfileCover ? (
                    // Plain img (same as FreelancerProfile) so cover reuses the browser-cached
                    // content URL. OptimizedImage adds ?w=&h= variants that miss cache and can 404.
                    <img
                      src={selfProfileCover}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="eager"
                      decoding="async"
                      onError={() => setSelfProfileCover('')}
                    />
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 bg-slate-900/35" />
                </div>
                {/*
                  top-full + -translate-y-[40%] pins the avatar to the cover bottom edge
                  with ~40% of the avatar over the cover (proportional on all breakpoints).
                */}
                <div
                  className="absolute left-1/2 top-full z-20 h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-[40%] overflow-hidden rounded-full bg-slate-100 shadow-[0_4px_14px_rgba(15,23,42,0.18)] ring-[5px] ring-white sm:h-20 sm:w-20"
                  data-testid="scrolith-member-home-profile-avatar"
                  aria-hidden={!resolvedUserAvatar}
                >
                  {resolvedUserAvatar ? (
                    <OptimizedImage
                      src={resolvedUserAvatar}
                      alt={user.name || 'User'}
                      width={160}
                      height={160}
                      sizes="80px"
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-100">
                      <Users className="h-7 w-7 text-slate-400" />
                    </div>
                  )}
                </div>
              </div>
              {/*
                Reserve space for the avatar portion that hangs below the cover (~60% of
                avatar height) plus name breathing room so content never sits under the face.
              */}
              <div className={`${enterprisePanelPadding} pt-[3.15rem] text-center sm:pt-[3.35rem]`}>
                <div className="min-w-0">
                  <p className="truncate text-[17px] font-semibold leading-snug text-slate-900">
                    {user?.name || user?.username || 'Community member'}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-slate-600">{userHeadline}</p>
                  {userLocation ? <p className="mt-0.5 truncate text-sm text-slate-500">{userLocation}</p> : null}
                </div>
                <div className="mt-5 space-y-2 text-left text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>Profile strength</span>
                    <span className="font-semibold text-slate-800">72%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100">
                    <div className="h-2.5 w-3/4 rounded-full bg-slate-900" />
                  </div>
                </div>
                <Link
                  to={buildProfileUrl({ id: currentUserId || undefined, username: currentUsername || undefined })}
                  className={`mt-5 w-full ${enterpriseCta}`}
                >
                  View profile
                </Link>
              </div>
            </div>

            <div className={`${enterprisePanel} ${enterprisePanelPadding} rise-fade-delay-2`}>
              <p className={enterpriseWidgetTitle}>Quick actions</p>
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={focusComposer}
                  className="col-span-2 flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5 text-[15px] font-medium text-slate-800 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Share an update
                  <Plus className="h-5 w-5 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/browse-jobs')}
                  className="flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 sm:text-[15px]"
                >
                  Browse jobs
                  <Briefcase className="h-5 w-5 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/browse')}
                  className="flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 sm:text-[15px]"
                >
                  Browse gigs
                  <Sparkles className="h-5 w-5 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/marketplace')}
                  className="flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 sm:text-[15px]"
                >
                  Marketplace
                  <ShoppingBag className="h-5 w-5 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/community/clubs')}
                  className="flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 sm:text-[15px]"
                >
                  Groups
                  <Users className="h-5 w-5 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/messages')}
                  className="col-span-2 flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 sm:text-[15px]"
                >
                  Messages
                  <MessageCircle className="h-5 w-5 text-slate-400" />
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-500">{featuredActionsTitle}</p>
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="mt-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => setProjectBriefOpen(true)}
                    className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{projectBriefQuickActionTitle}</p>
                        <p className="text-xs text-slate-500">{projectBriefQuickActionSubtitle}</p>
                      </div>
                      <FileText className="h-4 w-4 text-indigo-500" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleFeaturedGigCreation}
                    className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{gigCreationQuickActionTitle}</p>
                        <p className="text-xs text-slate-500">{gigCreationQuickActionSubtitle}</p>
                      </div>
                      <Briefcase className="h-4 w-4 text-indigo-500" />
                    </div>
                  </button>

                  {showFeaturedSidebarAd ? (
                    <div className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-left shadow-sm">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                          Sponsored
                        </span>
                        <Star className="h-3.5 w-3.5 text-amber-500" />
                      </div>
                      {sidebarFeaturedAd ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSidebarAdClick(sidebarFeaturedAd)}
                            className="block w-full text-left"
                          >
                            <p className="line-clamp-2 text-sm font-semibold text-slate-900">{sidebarFeaturedAd.title}</p>
                            {sidebarFeaturedAd.body ? (
                              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{sidebarFeaturedAd.body}</p>
                            ) : null}
                          </button>
                          {sidebarFeaturedAd.mediaUrl ? (
                            <div
                              onClick={() => handleSidebarAdClick(sidebarFeaturedAd)}
                              className="mt-2 cursor-pointer overflow-hidden rounded-lg border border-amber-100 bg-amber-50"
                            >
                              {sidebarFeaturedAd.mediaType === 'video' ? (
                                <AdVideoPlayer
                                  src={sidebarFeaturedAd.mediaUrl}
                                  className="h-20 w-full"
                                  videoClassName="h-full w-full object-cover"
                                  preload="metadata"
                                />
                              ) : (
                                <img
                                  src={sidebarFeaturedAd.mediaUrl}
                                  alt={sidebarFeaturedAd.title}
                                  className="h-20 w-full object-cover"
                                />
                              )}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => handleSidebarAdClick(sidebarFeaturedAd)}
                            className="mt-2 inline-flex rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white"
                          >
                            {sidebarFeaturedAd.ctaText || 'Learn more'}
                          </button>
                        </>
                      ) : (
                        <p className="text-xs text-slate-600">Approved campaigns rotate here once available.</p>
                      )}
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 px-3 py-3 text-left shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="h-4 w-4 text-emerald-600" />
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Marketplace</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">Recommended items picked for this feed.</p>
                      </div>
                      <Link
                        to="/marketplace"
                        className="inline-flex shrink-0 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                      >
                        Open
                      </Link>
                    </div>

                    <div className="mt-3 space-y-2">
                      {marketplacePreviewLoading ? (
                        <div className="space-y-2.5">
                          <div className="h-28 rounded-2xl bg-white/80 animate-pulse" />
                          <div className="h-28 rounded-2xl bg-white/80 animate-pulse" />
                        </div>
                      ) : marketplacePreviewListings.length > 0 ? (
                        marketplacePreviewListings.map((listing) => {
                          const image = resolveAssetUrl(
                            listing.coverImage ||
                              (Array.isArray(listing.images) && listing.images.length
                                ? (typeof listing.images[0] === 'string' ? listing.images[0] : listing.images[0]?.url)
                                : '')
                          );
                          const price = formatListingAmount(listing.price, listing.currency || 'USD');
                          const location = String(listing.location || '').trim();
                          const listingTitle = listing.title || 'Marketplace item';
                          return (
                            <Link
                              key={listing.id}
                              to={resolveMarketplaceListingUrl(listing)}
                              className="group flex flex-col rounded-2xl border border-white/80 bg-white/95 px-3 py-3 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-sm sm:px-3.5 sm:py-3.5"
                              data-testid="member-home-marketplace-reco-card"
                            >
                              {/* Title above image: ~30ch/line, max 2 lines, word-break + ellipsis */}
                              <div className="flex items-start justify-between gap-2">
                                <strong className="min-w-0 max-w-[30ch] break-words text-sm font-semibold leading-snug text-slate-900 line-clamp-2 sm:text-[15px]">
                                  {listingTitle}
                                </strong>
                                <ChevronRight
                                  className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-emerald-600"
                                  aria-hidden
                                />
                              </div>

                              {/* Square product image (~96–112px); object-fit cover preserved */}
                              <div className="mx-auto mt-2.5 h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-emerald-100/80 bg-slate-100 sm:mt-3 sm:h-28 sm:w-28">
                                {image ? (
                                  <OptimizedImage
                                    src={resolveAssetUrl(image)}
                                    alt={listingTitle}
                                    width={224}
                                    height={224}
                                    sizes="(max-width: 640px) 96px, 112px"
                                    fit="cover"
                                    quality={78}
                                    className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.04]"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center" aria-hidden>
                                    <ShoppingBag className="h-7 w-7 text-slate-400" />
                                  </div>
                                )}
                              </div>

                              {/* Recommended badge centered directly below image */}
                              <div className="mt-2.5 flex flex-col items-center gap-1 sm:mt-3">
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                  Recommended
                                </span>
                                <p className="max-w-full truncate text-center text-sm font-semibold text-emerald-700">
                                  {price}
                                  {location ? (
                                    <span className="font-medium text-slate-500">{` · ${location}`}</span>
                                  ) : null}
                                </p>
                                {listing.brand ? (
                                  <span className="max-w-full truncate text-center text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                    {listing.brand}
                                  </span>
                                ) : null}
                              </div>
                            </Link>
                          );
                        })
                      ) : (
                        <div className="rounded-2xl border border-dashed border-emerald-200 bg-white/80 px-3 py-3 text-xs text-slate-600">
                          Marketplace recommendations will appear here once active listings are available.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50 px-3 py-3 text-left shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-blue-600" />
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Groups</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">Recommended professional communities to join from this feed.</p>
                      </div>
                      <Link
                        to="/community/clubs"
                        className="inline-flex shrink-0 rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
                      >
                        Open
                      </Link>
                    </div>

                    <div className="mt-3 space-y-2">
                      {groupPreviewLoading ? (
                        <div className="space-y-2">
                          <div className="h-20 rounded-2xl bg-white/80 animate-pulse" />
                          <div className="h-20 rounded-2xl bg-white/80 animate-pulse" />
                        </div>
                      ) : groupPreviewRecommendations.length > 0 ? (
                        groupPreviewRecommendations.map((group) => {
                          const groupId = String(group.id || '').trim();
                          const image = resolveAssetUrl(group.avatarImage || group.coverImage || group.cover_image || '');
                          const memberCount = Number(group.memberCount ?? group.member_count ?? 0);
                          const isInviteOnly = String(group.joinMode || 'open').toLowerCase() === 'invite_only';
                          const requiresApproval =
                            String(group.joinMode || 'open').toLowerCase() === 'request' ||
                            String(group.visibility || 'public').toLowerCase() === 'private';
                          const joinLabel = group.pendingInvite
                            ? 'Open invite'
                            : group.pendingRequest
                              ? 'Pending'
                              : isInviteOnly
                                ? 'Invite only'
                                : requiresApproval
                                  ? 'Request'
                                  : 'Join';
                          const summary = String(group.summary || group.description || group.category || '').trim();
                          return (
                            <div
                              key={group.id}
                              className="rounded-2xl border border-white/80 bg-white/90 px-3 py-2.5 transition hover:border-blue-200 hover:shadow-sm"
                            >
                              <div className="flex items-start gap-3">
                                <Link to={buildGroupRecommendationPath(group)} className="group flex min-w-0 flex-1 items-start gap-3">
                                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                                    {image ? (
                                      <img
                                        src={image}
                                        alt={group.name || 'Group'}
                                        className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-100">
                                        <Users className="h-5 w-5 text-blue-500" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-slate-900">{group.name || 'Professional group'}</p>
                                    <p className="mt-0.5 truncate text-xs text-slate-500">
                                      {memberCount > 0 ? `${memberCount.toLocaleString()} members` : 'New community'}
                                      {group.category ? ` · ${group.category}` : ''}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                                        {group.visibility === 'private' ? 'Private' : 'Public'}
                                      </span>
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                        {String(group.joinMode || 'open').replace('_', ' ')}
                                      </span>
                                    </div>
                                    {summary ? <p className="mt-1 line-clamp-2 text-[11px] text-slate-600">{summary}</p> : null}
                                  </div>
                                </Link>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (group.pendingInvite) {
                                      navigate(buildGroupRecommendationPath(group));
                                      return;
                                    }
                                    void handleJoinGroupRecommendation(group);
                                  }}
                                  disabled={Boolean(groupJoinBusy[groupId]) || Boolean(group.pendingRequest)}
                                  className="inline-flex shrink-0 rounded-full border border-blue-200 bg-blue-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                  {groupJoinBusy[groupId] ? 'Working' : joinLabel}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-2xl border border-dashed border-blue-200 bg-white/80 px-3 py-3 text-xs text-slate-600">
                          Group recommendations will appear here once active communities are available.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Use div+role, not nested <main> — invalid landmark nesting can break CSS grid placement */}
          <div
            className={enterpriseFeedColumn}
            role="region"
            aria-label="Home feed"
            data-testid="scrolith-member-home-feed"
          >
            {showSlider && sliderItems.length > 0 && (
              <div className="rounded-3xl border border-white/70 bg-white p-3 sm:p-4 shadow-sm rise-fade-delay-1">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">{sliderTitle}</div>
                  <span className="text-sm text-slate-400">{sliderItems.length} highlight{sliderItems.length === 1 ? '' : 's'}</span>
                </div>
                <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                  {sliderItems.map((slide: any) => (
                    <div key={slide.id || slide.title} className="min-w-[200px] max-w-[200px] sm:min-w-[230px] sm:max-w-[230px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {slide.imageUrl && (
                        <OptimizedImage
                          src={resolveAssetUrl(slide.imageUrl)}
                          alt={slide.title || 'Highlight'}
                          width={640}
                          height={224}
                          sizes="(max-width: 768px) 100vw, 320px"
                          className="h-28 w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                      {slide.videoUrl && (
                        <video src={resolveAssetUrl(slide.videoUrl)} controls className="h-28 w-full object-cover" />
                      )}
                      <div className="p-3">
                        <p className="text-sm font-semibold text-slate-800 line-clamp-1">{slide.title || 'Highlight'}</p>
                        <p className="mt-1 text-sm text-slate-500 line-clamp-2">{slide.subtitle}</p>
                        {slide.ctaUrl && (
                          <a href={slide.ctaUrl} className="mt-2 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-700" target="_blank" rel="noreferrer">
                            {slide.ctaLabel || 'Learn more'}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showStories && (
              <div className="rounded-3xl border border-white/70 bg-white p-3 sm:p-4 shadow-sm rise-fade-delay-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 p-1">
                      <button
                        type="button"
                        onClick={() => setStoryRailTab('stories')}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          storyRailTab === 'stories' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        {storyTitle}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStoryRailTab('reels')}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          storyRailTab === 'reels' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        {reelsTitle}
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {storyRailTab === 'stories'
                        ? 'Share quick updates, photos, or videos with your community.'
                        : 'Watch short Scroll videos with autoplay preview and jump into the full Scroll feed.'}
                    </p>
                  </div>

                  {storyRailTab === 'stories' ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={storyDraft.visibility}
                        onChange={(event) =>
                          setStoryDraft((prev) => ({ ...prev, visibility: normalizeStoryVisibility(event.target.value) }))
                        }
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                      >
                        {storyVisibilityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setStoryTextOpen(true)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                        disabled={storyPosting}
                      >
                        Text story
                      </button>
                      <button
                        type="button"
                        onClick={() => storyDeviceInputRef.current?.click()}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                        disabled={storyPosting}
                      >
                        From device
                      </button>
                      <button
                        type="button"
                        onClick={startStoryCamera}
                        className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                        disabled={storyPosting}
                      >
                        Camera
                      </button>
                      {liveFeatureStatus.enabled ? (
                        <button
                          type="button"
                          onClick={() => navigate('/live/studio')}
                          className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-700"
                        >
                          Go Live
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setScrollCreateOpen(true)}
                        className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                      >
                        Create Scroll
                      </button>
                      {liveFeatureStatus.enabled ? (
                        <button
                          type="button"
                          onClick={() => navigate('/live/studio')}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                        >
                          Go Live
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>

                {storyRailTab === 'stories' ? (
                  <div className="mt-4 flex gap-2 sm:gap-3 overflow-x-auto pb-2">
                    <button
                      type="button"
                      onClick={() => storyDeviceInputRef.current?.click()}
                      className="flex h-56 min-w-[132px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500 sm:h-60 sm:min-w-[148px]"
                      disabled={storyPosting}
                    >
                      <Plus className="h-5 w-5 mb-2" />
                      Your story
                    </button>
                    {storiesLoading ? (
                      <div className="text-sm text-slate-400">Loading stories...</div>
                    ) : stories.length === 0 ? (
                      <div className="text-sm text-slate-400">No stories yet.</div>
                    ) : (
                      stories.map((story) => (
                        <button
                          key={story.id}
                          type="button"
                          onClick={() => openStory(story)}
                          className="relative h-56 min-w-[132px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:h-60 sm:min-w-[148px]"
                        >
                          {(() => {
                            const media = resolveStoryMedia(story);
                            const text = resolveStoryContent(story);
                            const isTextStory = String(story?.type || '').trim().toLowerCase() === 'text';
                            if (isTextStory && text) {
                              const style = getStoryTextStyle(story);
                              return (
                                <div
                                  className="flex h-full w-full items-center justify-center px-3 text-center text-sm font-semibold"
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
                                  width={176}
                                  height={264}
                                  sizes="88px"
                                  className="h-full w-full object-cover"
                                />
                              );
                            }
                            if (text) {
                              const style = getStoryTextStyle(story);
                              return (
                                <div
                                  className="flex h-full w-full items-center justify-center px-3 text-center text-sm font-semibold"
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
                              <div className="h-full w-full flex items-center justify-center text-sm text-slate-500">Story</div>
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
                  <div className="mt-4 flex gap-2 sm:gap-3 overflow-x-auto pb-2">
                    <button
                      type="button"
                      onClick={() => setScrollCreateOpen(true)}
                      className="flex h-56 min-w-[132px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500 sm:h-60 sm:min-w-[148px]"
                    >
                      <Plus className="h-5 w-5 mb-2" />
                      Create Scroll
                    </button>
                    {reelsLoading ? (
                      <div className="text-sm text-slate-400">Loading Scroll videos...</div>
                    ) : reels.length === 0 ? (
                      <div className="text-sm text-slate-400">No Scroll videos yet.</div>
                    ) : (
                      reels.map((scroll) => (
                        <button
                          key={scroll.id}
                          type="button"
                          onClick={() => navigate(`/scroll?scroll=${encodeURIComponent(scroll.id)}`)}
                          className="relative h-56 min-w-[132px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 sm:h-60 sm:min-w-[148px]"
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
                            <p className="text-[10px] text-white font-semibold line-clamp-1">{resolveReelAuthorName(scroll, 'Scrolith')}</p>
                            <p className="text-[10px] text-white/80 line-clamp-1">{scroll.title || scroll.description || 'Scroll'}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {memberHomeHighlightItems.length ? (
              <Suspense
                fallback={
                  <div className="rounded-3xl border border-white/70 bg-white p-5 text-sm text-slate-500 shadow-sm rise-fade-delay-1">
                    Loading discovery board...
                  </div>
                }
              >
                <MemberHomeHighlightsBoard
                  title="Professional Discovery Board"
                  subtitle="Intelligence across coach, live sessions, opportunities, network, and campaigns — ranked for your workspace."
                  pills={memberHomeHighlightPills}
                  items={memberHomeHighlightItems}
                  className="rise-fade-delay-1"
                />
              </Suspense>
            ) : null}

            <Suspense
              fallback={
                <div className="mt-4 rounded-3xl border border-white/70 bg-white p-5 text-sm text-slate-500 shadow-sm">
                  Loading live streams...
                </div>
              }
            >
              <LiveFeaturedRail
                surface="memberHome"
                title="Featured Live Streams"
                subtitle="Keep active livestreams visible on desktop and mobile web with a one-tap watch rail."
                className="mt-4"
              />
            </Suspense>

            <div id="member-home-feed-stream" className="rounded-3xl border border-white/70 bg-white p-4 shadow-sm rise-fade-delay-1">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{feedTitle}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Personalized professional graph · explainable ranking · real-time engagement signals
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                  Feed intelligence
                </span>
              </div>
              <div className="sticky top-24 z-10 -mx-2 sm:-mx-4 border-y border-slate-100 bg-white/95 px-2 sm:px-4 py-3 backdrop-blur">
                <div className="flex flex-wrap items-center gap-3">
                {showIntentModes ? (
                  <>
                    {[
                      { value: 'for_you' as FeedTab, label: 'For you', Icon: Compass },
                      { value: 'hire' as FeedTab, label: 'Hire', Icon: Briefcase },
                      { value: 'sell' as FeedTab, label: 'Sell', Icon: Coins },
                      { value: 'learn' as FeedTab, label: 'Learn', Icon: Sparkles },
                      { value: 'local' as FeedTab, label: 'Local', Icon: MapPin }
                    ].map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        onClick={() => setFeedTab(value)}
                        className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
                          feedTab === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon className="mr-2 inline h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </>
                ) : showDiscover ? (
                  <button
                    onClick={() => setFeedTab('latest')}
                    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
                      feedTab === 'latest' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Compass className="mr-2 inline h-4 w-4" />
                    Latest
                  </button>
                ) : null}
                {showFollowing && (
                  <button
                    onClick={() => setFeedTab('following')}
                    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
                      feedTab === 'following' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Users className="mr-2 inline h-4 w-4" />
                    Following
                  </button>
                )}
                {showTrending && (
                  <button
                    onClick={() => setFeedTab('trending')}
                    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
                      feedTab === 'trending' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Sparkles className="mr-2 inline h-4 w-4" />
                    Trending
                  </button>
                )}
                <button
                  onClick={() => void loadFeed({ forceRetryOrchestrated: true })}
                  className="ml-auto rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase text-slate-600"
                >
                  Refresh
                </button>
              </div>
              </div>
              {feedTab !== 'following' && showCategoriesFilter && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <select
                    value={feedTopic}
                    onChange={(e) => setFeedTopic(e.target.value)}
                    className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-600"
                  >
                    <option value="">All topics</option>
                    {topics.map((topic) => (
                      <option key={topic} value={topic}>
                        {topic}
                      </option>
                    ))}
                  </select>
                  {regions.length > 0 ? (
                    <select
                      value={feedRegion}
                      onChange={(e) => setFeedRegion(e.target.value)}
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-600"
                    >
                      <option value="">All regions</option>
                      {regions.map((region) => (
                        <option key={region} value={region}>
                          {region}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={feedRegion}
                        onChange={(e) => setFeedRegion(e.target.value)}
                        placeholder={user?.location || user?.country || 'Region or city'}
                        className="w-full rounded-2xl border border-slate-200 py-2 pl-9 pr-4 text-sm text-slate-600"
                      />
                    </div>
                  )}
                </div>
              )}
              {renderDesktopComposer()}
            </div>

            <div className="space-y-4">
              {shouldShowInitialSkeleton({ loading: feedLoading, existingItemCount: feedItems.length }) ? (
                <div
                  className="min-h-[24rem] rounded-3xl border border-white/70 bg-white p-6 text-center text-sm text-slate-500 shadow-sm"
                  role="status"
                  aria-live="polite"
                >
                  Loading your feed...
                </div>
              ) : feedItems.length === 0 ? (
                <div className="min-h-[12rem] rounded-3xl border border-white/70 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                  {feedTopic || feedRegion
                    ? 'No posts match the current filters. Clear the topic or region filter to widen your feed.'
                    : 'No posts found. Follow creators or switch to Discover to explore.'}
                </div>
              ) : (
                renderableFeedItems.map((post, postIndex) => {
                  const isEditing = editingPostId === post.id && editingDraft;
                  const postBusy = Boolean(postActionBusy[post.id]);
                  const commentCount = commentCounts[post.id] ?? post.interactions?.comments ?? 0;
                  const postTitle =
                    readRenderableText(post.title) ||
                    readRenderableText((post as any).headline) ||
                    readRenderableText((post as any).subject);
                  const postContent =
                    readRenderableText(post.content) ||
                    readRenderableText((post as any).body) ||
                    readRenderableText((post as any).text) ||
                    readRenderableText((post as any).description) ||
                    readRenderableText(post.originalPost?.content) ||
                    '';
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
                  const authorTypeNorm = String(resolvedAuthor.type || 'user').toLowerCase();
                  const followTargetId = String(resolvedAuthor.id || '').trim();
                  const initialIsFollowing = followTargetId
                    ? followStateMap[followTargetId] ??
                      post.viewer?.isFollowingAuthor ??
                      post.viewer?.isFollowingPage
                    : undefined;
                  return (
                    <React.Fragment key={getStableFeedReactKey(post, postIndex)}>
                      <article
                        className={`${enterprisePostCard} ${postDensity === 'compact' ? enterprisePostCardCompact : enterprisePostCardPadding}`}
                      >
                      <PostHeader
                        author={resolvedAuthor}
                        createdAt={post.createdAt}
                        currentUserId={user?.id}
                        showFollow={Boolean(followTargetId)}
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
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                <Pin className="h-3 w-3" />
                                Pinned
                              </span>
                            )}
                            {post.isHighlighted && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                <Star className="h-3 w-3" />
                                Highlighted
                              </span>
                            )}
                            {post.isAIEnhanced && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                <Sparkles className="h-3 w-3" />
                                AI-enhanced
                              </span>
                            )}
                            {post.graphicWarning && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                <AlertTriangle className="h-3 w-3" />
                                {GRAPHIC_WARNING_LABEL}
                              </span>
                            )}
                          </>
                        }
                        rightSlot={
                          <div className="flex min-w-fit items-center gap-2 whitespace-nowrap">
                            <PostOptionsButton
                              post={post}
                              icon={<MoreHorizontal className="h-4 w-4" />}
                              buttonClassName="rounded-full border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                              onHideFromFeed={(hiddenPostId) => {
                                setFeedItems((prev) => prev.filter((item) => item.id !== hiddenPostId));
                                setCommentCounts((prev) => {
                                  const next = { ...prev };
                                  delete next[hiddenPostId];
                                  return next;
                                });
                                if (editingPostId === hiddenPostId) cancelEditPost();
                              }}
                              onEditPost={beginEditPost}
                              onDeletePost={handleDeletePost}
                              onTogglePin={handleTogglePin}
                              onToggleHighlight={handleToggleHighlight}
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
                            className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-600"
                          />
                          <MentionHashtagTextarea
                            value={editingDraft?.content || ''}
                            onChange={(nextValue) =>
                              setEditingDraft((prev) => (prev ? { ...prev, content: nextValue } : prev))
                            }
                            mentionsEnabled={mentionsEnabled}
                            hashtagsEnabled={hashtagsEnabled}
                            className="min-h-[120px] w-full rounded-2xl border border-slate-200 p-3 text-sm text-slate-700"
                          />
                          <div className="text-xs text-slate-500">
                            {hashtagsEnabled ? '#tags' : '#tags (disabled by admin)'} and{' '}
                            {mentionsEnabled ? '@mentions' : '@mentions (disabled by admin)'} supported
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
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
                            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
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
                            <label className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
                                className="mt-2 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
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
                              className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-600"
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
                              className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-600"
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
                              list="member_home_topics"
                              placeholder="Topic (optional)"
                              className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-600"
                            />
                            <input
                              value={editingDraft?.location || ''}
                              onChange={(event) =>
                                setEditingDraft((prev) => (prev ? { ...prev, location: event.target.value } : prev))
                              }
                              list="member_home_locations"
                              placeholder="Location (optional)"
                              className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-600"
                            />
                          </div>
                          {editingDraft?.media?.length ? (
                            <div className="grid gap-3 md:grid-cols-2">
                              {editingDraft.media.map((media) => {
                                const type = media.type || inferMediaType(media);
                                return (
                                  <div key={media.localId} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                    <button
                                      type="button"
                                      onClick={() => removeEditMedia(media.localId)}
                                      className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-1 text-slate-500 hover:text-slate-700"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                    {type === 'video' ? (
                                      <video
                                        src={resolvePostAttachmentMediaUrl(media) || resolveAssetUrl(media.url) || ''}
                                        className="h-40 w-full object-cover"
                                        controls
                                      />
                                    ) : type === 'image' ? (
                                      <OptimizedImage
                                        src={resolvePostAttachmentPosterUrl(media) || resolvePostAttachmentMediaUrl(media) || resolveAssetUrl(media.url) || ''}
                                        fallbackSrc={resolvePostAttachmentMediaUrl(media) || resolveAssetUrl(media.url) || ''}
                                        alt={media.name || 'Post media'}
                                        width={960}
                                        height={540}
                                        sizes="(max-width: 1280px) 100vw, 420px"
                                        className="h-40 w-full object-cover"
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    ) : (
                                      <div className="flex h-40 w-full items-center justify-center p-4 text-xs text-slate-500">
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
                              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={submitPostEdit}
                              disabled={postBusy}
                              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase text-white disabled:opacity-60"
                            >
                              {postBusy ? 'Saving...' : 'Save changes'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="mt-4 space-y-4">
                            {focusPostId === post.id && focusMentionToken ? (
                              <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                                You were mentioned in this post.
                              </div>
                            ) : null}
                            <PostOriginPreview originalPost={post.originalPost} />
                            {postContent || postTitle ? (
                              <TranslatablePostText
                                post={post}
                                viewerId={user?.id}
                                viewerUsername={user?.username}
                                mentionToken={focusPostId === post.id ? focusMentionToken : undefined}
                                expandable
                                titleClassName="text-left text-[1.35rem] font-semibold leading-snug tracking-tight text-slate-950 transition hover:text-slate-700 [overflow-wrap:anywhere] sm:text-[1.4rem]"
                                contentWrapperClassName="cursor-pointer text-[15px] leading-[1.7] text-slate-700 [overflow-wrap:anywhere] sm:text-base sm:leading-[1.75]"
                                buttonClassName="text-slate-900"
                                translationRowClassName="text-slate-500"
                                onTitleClick={postTitle ? () => openPostCard(post) : undefined}
                                onContentClick={(event) => openPostFromText(event, post)}
                                onContentKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    openPostCard(post);
                                  }
                                }}
                              />
                            ) : !post.attachments?.length ? (
                              <button
                                type="button"
                                onClick={() => openPostCard(post)}
                                className="text-left text-sm italic text-slate-500 transition hover:text-slate-700"
                              >
                                Open post
                              </button>
                            ) : null}
                            {post.tags?.length ? (
                              <div className="flex flex-wrap gap-2">
                                {post.tags.map((tag) => (
                                  <span key={tag} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            <div className="rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                                  <Sparkles className="h-3.5 w-3.5" />
                                  Scrolitha coach
                                </span>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    openScrolithaFromMemberHome(buildPostScrolithaPrompt(postTitle, postContent));
                                  }}
                                  className="inline-flex items-center rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700 transition hover:bg-violet-100"
                                >
                                  Enhance post
                                </button>
                              </div>
                              <p className="mt-1 text-xs text-slate-600">Get recommendation prompts for stronger reach, clarity, and conversion.</p>
                            </div>
                            <ContentOfferTags offerTags={post.offerTags} />
                            {post.aiInsightGenerated && post.aiInsightText ? (
                              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
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
                                  <p className="mt-2 text-sm text-emerald-900">
                                    {post.aiInsightText}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                            {renderAttachments(post, post.attachments)}
                              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                                {post.topic ? <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm">Topic: {post.topic}</span> : null}
                                {post.location ? <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm">Location: {post.location}</span> : null}
                                <FeedIntelligenceSignals
                                  ranking={post.ranking}
                                  interactions={post.interactions}
                                  showWhy={showWhyThisPost}
                                  showEngagement
                                />
                                {showPipelineSave ? (
                                  <button
                                    type="button"
                                    onClick={() => togglePipelineSave(post)}
                                    disabled={Boolean(pipelineBusyByPostId[post.id])}
                                    className={`rounded-full border px-3 py-1.5 font-semibold shadow-sm transition ${
                                      post.pipelineState?.saved
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                                    } ${pipelineBusyByPostId[post.id] ? 'cursor-not-allowed opacity-60' : ''}`}
                                  >
                                    {pipelineBusyByPostId[post.id]
                                      ? 'Saving...'
                                      : post.pipelineState?.saved
                                        ? 'Saved to pipeline'
                                        : 'Save to pipeline'}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          <PostEngagementBar
                            postId={post.id}
                            postTitle={post.title}
                            postContent={post.content}
                            authorId={post.authorUserId || post.authorId}
                            dashGcoinTotal={Number(post.dashGcoinTotal ?? post.interactions?.dashGcoinTotal ?? 0)}
                            commentPolicy={post.commentPolicy}
                            postRepostsEnabled={post.repostsEnabled}
                            commentCount={commentCount}
                            repostCount={post.repostsCount ?? post.interactions?.reposts ?? 0}
                            shareCount={post.sharesCount ?? post.interactions?.shares ?? 0}
                            viewCount={post.interactions?.views ?? post.viewsCount ?? 0}
                            initialReactionCounts={post.interactions?.reactions}
                            initialUserReaction={post.userState?.reaction}
                            interestSurveyEnabled={post.id === interestSurveyPostId}
                            initialInterestSignal={post.userState?.interestSignal}
                            focusCommentId={focusPostId === post.id ? focusCommentId : undefined}
                            focusMentionToken={focusPostId === post.id ? focusMentionToken : undefined}
                            onCommentCountChange={syncCommentCount}
                          />
                        </>
                      )}
                      </article>
                      {showListingCards && (postIndex + 1) % listingCardEveryPosts === 0 ? (
                        (() => {
                          const slotIndex = Math.floor((postIndex + 1) / listingCardEveryPosts) - 1;
                          const entry = listingCardEntries[slotIndex];
                          if (!entry) return null;
                          return renderInlineListingCard(entry, slotIndex);
                        })()
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
              <div ref={desktopFeedSentinelRef} className="h-10 shrink-0" aria-hidden="true" />
              {feedLoadingMore ? (
                <div className="min-h-[2.5rem] pb-2 text-center text-xs font-medium text-slate-500" role="status" aria-live="polite">
                  Loading more posts...
                </div>
              ) : renderedFeedItemCount < feedItems.length ? (
                <div className="flex min-h-[3rem] flex-col items-center gap-2 pb-2">
                  <div className="text-center text-xs font-medium text-slate-500">
                    Scroll to reveal more posts.
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setRenderedFeedItemCount((prev) => {
                        const next = Math.min(feedItems.length, prev + desktopRenderStep);
                        renderedFeedItemCountRef.current = next;
                        return next;
                      })
                    }
                    className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                  >
                    Show more
                  </button>
                </div>
              ) : feedTerminal ? (
                <div className="pb-3 text-center text-xs font-medium text-slate-500">
                  You&apos;re all caught up. No more unique posts from available sources.
                </div>
              ) : feedNextCursor || feedOffsetFallbackEnabled || !feedDiscoveryUsedRef.current ? (
                <div className="flex justify-center pb-3">
                  <button
                    type="button"
                    onClick={() => void loadMoreFeed()}
                    className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                  >
                    Load more
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <aside
            className={enterpriseRightColumn}
            aria-label="Recommendations and insights"
            data-testid="scrolith-member-home-right"
          >
            <Suspense
              fallback={
                <div className={`${enterprisePanel} ${enterprisePanelPadding} text-sm text-slate-500`}>
                  Loading insights...
                </div>
              }
            >
              <InsightsQuickPanel desktopMode="rail" className="" />
            </Suspense>
            {showTopSidebarAd && (
              <div className={`${enterprisePanel} border-amber-200 bg-amber-50/90 ${enterprisePanelPadding}`}>
                <div className={`mb-3 ${enterpriseSponsoredLabel}`}>Sponsored</div>
                {sidebarTopAd ? (
                  <>
                    <p className={enterpriseWidgetHeading}>{sidebarTopAd.title}</p>
                    {sidebarTopAd.body ? (
                      <p className="mt-2 line-clamp-3 text-[15px] leading-relaxed text-slate-600">{sidebarTopAd.body}</p>
                    ) : null}
                    {sidebarTopAd.mediaUrl ? (
                      <div className="mt-3 overflow-hidden rounded-xl border border-amber-100 bg-white" style={{ aspectRatio: '16 / 9' }}>
                        {sidebarTopAd.mediaType === 'video' ? (
                          <AdVideoPlayer
                            src={sidebarTopAd.mediaUrl}
                            className="h-full w-full"
                            videoClassName="h-full w-full object-cover"
                            preload="auto"
                          />
                        ) : (
                          <img
                            src={sidebarTopAd.mediaUrl}
                            alt={sidebarTopAd.title}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleSidebarAdClick(sidebarTopAd)}
                      className={`mt-4 ${enterpriseCtaPrimary}`}
                    >
                      {sidebarTopAd.ctaText || 'Learn more'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className={enterpriseWidgetHeading}>No sponsored campaigns available right now.</p>
                    <p className="mt-2 text-[15px] text-slate-600">Approved campaigns from the ads manager will appear here automatically.</p>
                  </>
                )}
              </div>
            )}
            {showMessages && (
              <div className={`${enterprisePanel} ${enterprisePanelPadding} rise-fade-delay-1`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <MessageCircle className="h-5 w-5 shrink-0 text-slate-600" />
                    <h3 className={enterpriseWidgetHeading}>{messagesTitle}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/messages')}
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:text-slate-800"
                  >
                    View all
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {messagesLoading ? (
                    <p className="text-[15px] text-slate-500">Loading messages...</p>
                  ) : conversations.length === 0 ? (
                    <p className="text-[15px] text-slate-500">No messages yet.</p>
                  ) : (
                    conversations.map((conversation) => {
                      const participants = Array.isArray(conversation.participants)
                        ? conversation.participants.filter((p: any) => p.id !== user?.id)
                        : [];
                      const primary = participants[0] || conversation.participants?.[0] || {};
                      return (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => navigate(`/messages/${conversation.id}`)}
                          className="flex min-h-[3.5rem] w-full items-start justify-between gap-3 rounded-xl border border-slate-200 p-3.5 text-left transition hover:border-slate-300 hover:bg-slate-50/80"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="h-12 w-12 overflow-hidden rounded-full bg-slate-100">
                              {primary.avatar ? (
                                <OptimizedImage
                                  src={resolveAssetUrl(primary.avatar)}
                                  alt={primary.name || 'Message'}
                                  width={96}
                                  height={96}
                                  sizes="48px"
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <Users className="mx-auto mt-3 h-5 w-5 text-slate-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[15px] font-semibold text-slate-900">{primary.name || 'Conversation'}</p>
                              <p className="truncate text-sm text-slate-500">{conversation.lastMessage || 'Start the conversation'}</p>
                            </div>
                          </div>
                          {conversation.unreadCount ? (
                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                              {conversation.unreadCount}
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {(showProfileViewers || showProfileViewing) && (
              <div className={`${enterprisePanel} ${enterprisePanelPadding} rise-fade-delay-1`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Users className="h-5 w-5 shrink-0 text-slate-600" />
                    <h3 className={enterpriseWidgetHeading}>{profileViewersTitle}</h3>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Last 7 days</span>
                </div>

                <div className="mt-4 space-y-3">
                  {viewersLoading ? (
                    <p className="text-[15px] text-slate-500">Loading viewers...</p>
                  ) : profileViewers.length === 0 ? (
                    <p className="text-[15px] text-slate-500">No profile views yet.</p>
                  ) : (
                    profileViewers.map((viewer) => (
                      <Link
                        key={`${viewer.id}-${viewer.viewedAt}`}
                        to={buildProfileUrl(viewer)}
                        className="flex min-h-[3.5rem] items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5 transition hover:border-slate-300 hover:bg-slate-50/80"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="h-12 w-12 overflow-hidden rounded-full bg-slate-100">
                            {viewer.avatar ? (
                              <OptimizedImage
                                src={resolveAssetUrl(viewer.avatar)}
                                alt={viewer.name}
                                width={96}
                                height={96}
                                sizes="48px"
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <Users className="mx-auto mt-3 h-5 w-5 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-semibold text-slate-900">{viewer.name}</p>
                            <p className="truncate text-sm text-slate-500">{viewer.subtitle}</p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold uppercase text-slate-400">Viewed</span>
                      </Link>
                    ))
                  )}
                </div>

                {showProfileViewing && (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
                      <Compass className="h-4 w-4 text-slate-600" />
                      {profileViewingTitle}
                    </div>
                    <div className="mt-3 space-y-3">
                      {viewersLoading ? (
                        <p className="text-sm text-slate-500">Loading recent views...</p>
                      ) : profileViewing.length === 0 ? (
                        <p className="text-sm text-slate-500">No recent profile visits.</p>
                      ) : (
                        profileViewing.map((viewer) => (
                          <Link
                            key={`${viewer.id}-${viewer.viewedAt}-viewed`}
                            to={buildProfileUrl(viewer)}
                            className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 hover:border-slate-300"
                          >
                            <div className="h-10 w-10 rounded-full bg-slate-100 overflow-hidden">
                              {viewer.avatar ? (
                                <OptimizedImage
                                  src={resolveAssetUrl(viewer.avatar)}
                                  alt={viewer.name}
                                  width={96}
                                  height={96}
                                  sizes="40px"
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <Users className="mx-auto mt-2 h-5 w-5 text-slate-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-slate-800">{viewer.name}</p>
                              <p className="truncate text-sm text-slate-500">{viewer.subtitle}</p>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {showPagesRecommendations && (
              <div className={`${enterprisePanel} ${enterprisePanelPadding} rise-fade-delay-1`}>
                <div className="flex items-center gap-2.5">
                  <Briefcase className="h-5 w-5 text-slate-600" />
                  <h3 className={enterpriseWidgetHeading}>{pagesTitle}</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {recommendedPages.length === 0 ? (
                    <p className="text-[15px] text-slate-500">No page recommendations available yet.</p>
                  ) : (
                    recommendedPages.map((page) => (
                      <div key={page.id} className="rounded-xl border border-slate-200 p-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <Link to={buildPageUrl(page)} className="block truncate text-[15px] font-semibold text-slate-900 hover:text-blue-600">
                              {page.name}
                            </Link>
                            <p className="truncate text-sm text-slate-500">{page.tagline || page.industry || 'Business page'}</p>
                            <p className="text-xs text-slate-400">{page.followersCount || 0} followers</p>
                          </div>
                          <button
                            type="button"
                            disabled={Boolean(pagesFollowBusy[page.id])}
                            onClick={() => handlePageFollow(page)}
                            className={`min-h-10 shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold uppercase ${
                              page.isFollowing
                                ? 'border-slate-300 text-slate-600'
                                : 'border-blue-200 text-blue-600'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            {pagesFollowBusy[page.id] ? 'Please wait...' : page.isFollowing ? 'Following' : 'Follow'}
                          </button>
                        </div>
                        <RecoSignalChips reasons={page.reasons} whyRecommended={page.whyRecommended} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {showMiddleSidebarAd && (
              <div className={`${enterprisePanel} border-amber-200 bg-amber-50/90 ${enterprisePanelPadding}`}>
                <div className={`mb-3 ${enterpriseSponsoredLabel}`}>Sponsored</div>
                {sidebarMiddleAd ? (
                  <>
                    <p className={enterpriseWidgetHeading}>{sidebarMiddleAd.title}</p>
                    {sidebarMiddleAd.body ? (
                      <p className="mt-2 line-clamp-3 text-[15px] leading-relaxed text-slate-600">{sidebarMiddleAd.body}</p>
                    ) : null}
                    {sidebarMiddleAd.mediaUrl ? (
                      <div className="mt-3 overflow-hidden rounded-xl border border-amber-100 bg-white" style={{ aspectRatio: '16 / 9' }}>
                        {sidebarMiddleAd.mediaType === 'video' ? (
                          <AdVideoPlayer
                            src={sidebarMiddleAd.mediaUrl}
                            className="h-full w-full"
                            videoClassName="h-full w-full object-cover"
                            preload="auto"
                          />
                        ) : (
                          <img
                            src={sidebarMiddleAd.mediaUrl}
                            alt={sidebarMiddleAd.title}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleSidebarAdClick(sidebarMiddleAd)}
                      className={`mt-4 ${enterpriseCta}`}
                    >
                      {sidebarMiddleAd.ctaText || 'View campaign'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className={enterpriseWidgetHeading}>No sponsored campaigns available right now.</p>
                    <p className="mt-2 text-[15px] text-slate-600">Enable and approve ad campaigns in Admin - Community - Ads Manager.</p>
                  </>
                )}
              </div>
            )}

            {showProfiles && (
              <div className={`${enterprisePanel} ${enterprisePanelPadding} rise-fade-delay-1`}>
                <div className="flex items-center gap-2.5">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  <h3 className={enterpriseWidgetHeading}>{profilesTitle}</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {profiles.length === 0 ? (
                    <p className="text-[15px] text-slate-500">No recommendations yet.</p>
                  ) : (
                    profiles.map((profile) => (
                      <div key={profile.id} className="rounded-xl border border-slate-200/80 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <Link to={buildProfileUrl(profile)} className="flex min-w-0 items-center gap-3">
                            <div className="h-12 w-12 overflow-hidden rounded-full bg-slate-100">
                              {profile.avatar ? (
                                <OptimizedImage
                                  src={resolveAssetUrl(profile.avatar)}
                                  alt={profile.name}
                                  width={96}
                                  height={96}
                                  sizes="48px"
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <Users className="mx-auto mt-3 h-5 w-5 text-slate-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="truncate text-[15px] font-semibold text-slate-900">{profile.name}</p>
                                {profile.badge ? (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    {profile.badge}
                                  </span>
                                ) : null}
                              </div>
                              <p className="truncate text-sm text-slate-500">{profile.subtitle}</p>
                            </div>
                          </Link>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleFollow(profile)}
                              className="min-h-10 rounded-full border border-slate-200 px-3.5 py-2 text-xs font-semibold uppercase text-slate-700"
                            >
                              {followingIds.has(profile.id) ? 'Following' : 'Follow'}
                            </button>
                            <button
                              onClick={() => handleMessage(profile)}
                              className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase text-white"
                            >
                              Contact
                            </button>
                          </div>
                        </div>
                        <RecoSignalChips reasons={profile.reasons} whyRecommended={profile.whyRecommended} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {showJobs && (
              <div className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm rise-fade-delay-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Briefcase className="h-4 w-4 text-slate-700" />
                  {jobsTitle}
                </div>
                <div className="mt-4 space-y-3">
                  {jobs.length === 0 ? (
                    <p className="text-sm text-slate-500">No jobs available yet.</p>
                  ) : (
                    jobs.map((job) => (
                      <Link key={job.id} to={`/jobs/${job.id}`} className="block rounded-2xl border border-slate-200 p-3 hover:border-slate-300">
                        <p className="text-sm font-semibold text-slate-800 break-words [overflow-wrap:anywhere]">{job.title}</p>
                        <p className="text-sm text-slate-500 flex items-center gap-2 flex-wrap">
                          <span className="break-words [overflow-wrap:anywhere]">{job.clientName || 'Employer'}</span>
                          {isClientVerified(job) ? (
                            <VerifiedBadge
                              size={16}
                              level={getClientVerificationLevel(job)}
                              className="ml-1"
                              subjectRole="employer"
                              subjectType={(job as any)?.clientType || 'business'}
                            />
                          ) : null}
                          <ProBadge role="employer" isPro={(job as any)?.clientIsPro} />
                          <span>&middot; {job.category}</span>
                        </p>
                        <p className="text-sm text-slate-500 mt-1">
                          Budget:{' '}
                          {typeof (job as any).budget === 'string'
                            ? (job as any).budget
                            : (job as any).budget?.amount
                              ? `$${(job as any).budget.amount}`
                              : 'Flexible'}
                        </p>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}

            {isFreelancer && showEmployers && (
              <div className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm rise-fade-delay-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Users className="h-4 w-4 text-slate-700" />
                  {employersTitle}
                </div>
                <div className="mt-4 space-y-3">
                  {employers.length === 0 ? (
                    <p className="text-sm text-slate-500">No employers available yet.</p>
                  ) : (
                    employers.map((employer) => (
                      <div key={employer.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-100 overflow-hidden">
                            {employer.avatar ? (
                              <OptimizedImage
                                src={resolveAssetUrl(employer.avatar)}
                                alt={employer.name}
                                width={96}
                                height={96}
                                sizes="48px"
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <Users className="mx-auto mt-2 h-5 w-5 text-slate-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{employer.name}</p>
                            <p className="text-sm text-slate-500">{employer.subtitle}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleFollow(employer)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold uppercase text-slate-600"
                          >
                            {followingIds.has(employer.id) ? 'Following' : 'Follow'}
                          </button>
                          <button
                            onClick={() => handleMessage(employer)}
                            className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase text-white"
                          >
                            Message
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {showGigs && (
              <div className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm rise-fade-delay-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  {gigsTitle}
                </div>
                <div className="mt-4 space-y-3">
                  {gigs.length === 0 ? (
                    <p className="text-sm text-slate-500">No gigs available yet.</p>
                  ) : (
                    gigs.map((gig: any) => (
                      <Link key={gig.id} to={`/gigs/${gig.id}`} className="block rounded-2xl border border-slate-200 p-3 hover:border-slate-300">
                        <p className="text-sm font-semibold text-slate-800 break-words [overflow-wrap:anywhere]">{gig.title}</p>
                        <p className="text-sm text-slate-500 flex items-center gap-2 flex-wrap">
                          <span className="break-words [overflow-wrap:anywhere]">{gig.freelancerName || 'Freelancer'}</span>
                          {isFreelancerVerified(gig) ? (
                            <VerifiedBadge
                              size={16}
                              level={getFreelancerVerificationLevel(gig)}
                              className="ml-1"
                              subjectRole="freelancer"
                              subjectType={(gig as any)?.freelancerType || 'user'}
                            />
                          ) : null}
                          <ProBadge role="freelancer" isPro={(gig as any)?.freelancerIsPro} />
                          <span>&middot; {gig.category}</span>
                        </p>
                        <p className="text-sm text-slate-500 mt-1">From ${gig.price?.amount ?? gig.price}</p>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}

            {isEmployer && showFreelancers && (
              <div className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm rise-fade-delay-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Users className="h-4 w-4 text-slate-700" />
                  {freelancersTitle}
                </div>
                <div className="mt-4 space-y-3">
                  {freelancers.length === 0 ? (
                    <p className="text-sm text-slate-500">No freelancers available yet.</p>
                  ) : (
                    freelancers.map((freelancer) => (
                      <div key={freelancer.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-100 overflow-hidden">
                            {freelancer.avatar ? (
                              <OptimizedImage
                                src={resolveAssetUrl(freelancer.avatar)}
                                alt={freelancer.name}
                                width={96}
                                height={96}
                                sizes="48px"
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <Users className="mx-auto mt-2 h-5 w-5 text-slate-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{freelancer.name}</p>
                            <p className="text-sm text-slate-500">{freelancer.subtitle}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleFollow(freelancer)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold uppercase text-slate-600"
                          >
                            {followingIds.has(freelancer.id) ? 'Following' : 'Follow'}
                          </button>
                          <button
                            onClick={() => handleMessage(freelancer)}
                            className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase text-white"
                          >
                            Message
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {aiSuggestionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">
          <div className="w-full max-w-4xl max-h-[92dvh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">AI Draft Suggestion</h3>
                <p className="text-xs text-slate-500">
                  {aiSuggestionMode
                    ? `Mode: ${postAiActions.find((entry) => entry.mode === aiSuggestionMode)?.label || aiSuggestionMode}`
                    : 'Review before applying'}
                </p>
                {aiSuggestionWarning && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                    {aiSuggestionWarning}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={closeAiSuggestionModal}
                className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAiCompareView('compare')}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  aiCompareView === 'compare'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-700'
                }`}
              >
                Compare version
              </button>
              <button
                type="button"
                onClick={() => setAiCompareView('ai')}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  aiCompareView === 'ai'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-700'
                }`}
              >
                AI only
              </button>
            </div>

            {aiCompareView === 'compare' ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Original</div>
                  <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{aiOriginalText || '(empty)'}</pre>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">AI Version</div>
                  <pre className="mt-2 whitespace-pre-wrap text-sm text-emerald-900">{aiSuggestion || '(empty)'}</pre>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <pre className="whitespace-pre-wrap text-sm text-emerald-900">{aiSuggestion || '(empty)'}</pre>
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeAiSuggestionModal}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyAiSuggestionInsert}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Insert Below
              </button>
              <button
                type="button"
                onClick={applyAiSuggestionReplace}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={postMediaInputRef}
        type="file"
        multiple
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
        className="hidden"
        onChange={handlePostMedia}
      />
      <input
        ref={postCameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={handlePostMedia}
      />
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

      {scrollCreateOpen ? (
        <Suspense fallback={null}>
          <ScrollCreateModal
            open={scrollCreateOpen}
            onClose={() => setScrollCreateOpen(false)}
            config={scrollConfig}
            onCreated={(created) => {
              setReels((prev) => [created, ...prev.filter((item) => item.id !== created.id)].slice(0, maxReels));
              setStoryRailTab('reels');
            }}
          />
        </Suspense>
      ) : null}

      {storyMediaUploadLabel && storyMediaUploadBusy && !storyMediaPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 sm:p-5 shadow-2xl">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Uploading story media</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Scrolith is uploading your file and preparing it for story publishing.
                </p>
              </div>
              <StoryUploadStatusCard
                busy={storyMediaUploadBusy}
                label={storyMediaUploadLabel}
                progress={storyMediaUploadProgress}
                hint="Keep this window open while your story media uploads."
              />
            </div>
          </div>
        </div>
      )}

      {storyMediaPreviewOpen && storyMediaDraftFile?.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
          <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Story preview</h3>
                <p className="text-xs text-slate-500">Review your media, add a caption, and publish when ready.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (storyPosting) return;
                  setStoryMediaPreviewOpen(false);
                  setStoryMediaDraftFile(null);
                  clearStoryMediaUploadState();
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {storyMediaUploadLabel ? (
                <StoryUploadStatusCard
                  busy={storyMediaUploadBusy}
                  label={storyMediaUploadLabel}
                  progress={storyMediaUploadProgress}
                  hint={
                    storyMediaUploadBusy
                      ? 'Scrolith is finalizing your upload before publish.'
                      : 'Your media is uploaded. Add a caption if you want, then publish.'
                  }
                />
              ) : null}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                {(() => {
                  const url =
                    storyMediaDraftFile?.url ||
                    storyMediaDraftFile?.downloadUrl ||
                    storyMediaDraftFile?.download_url ||
                    '';
                  const mime = String(storyMediaDraftFile?.mimeType || storyMediaDraftFile?.mime_type || '').toLowerCase();
                  const explicitType = String(storyMediaDraftFile?.type || '').toLowerCase();
                  const isVideo = explicitType === 'video' || mime.startsWith('video/');
                  if (!url) {
                    return <div className="flex h-48 w-full items-center justify-center text-sm text-slate-600">Media preview not available.</div>;
                  }
                  return isVideo ? (
                    <video
                      src={url}
                      className="h-56 w-full object-cover"
                      controls
                      autoPlay
                      muted
                      playsInline
                      loop
                      preload="metadata"
                    />
                  ) : (
                    <OptimizedImage
                      src={resolveAssetUrl(url)}
                      alt="Story preview"
                      width={720}
                      height={1280}
                      sizes="(max-width: 768px) 100vw, 420px"
                      className="h-56 w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  );
                })()}
              </div>

              <textarea
                value={storyDraft.content}
                onChange={(event) => setStoryDraft((prev) => ({ ...prev, content: event.target.value }))}
                placeholder="Add a caption (optional)"
                className="min-h-[120px] w-full rounded-2xl border border-slate-200 p-3 text-sm text-slate-700"
                disabled={storyPosting}
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                  <span className="text-slate-500">Visibility</span>
                  <select
                    value={storyDraft.visibility}
                    onChange={(event) =>
                      setStoryDraft((prev) => ({ ...prev, visibility: event.target.value as StoryDraft['visibility'] }))
                    }
                    className="bg-transparent text-xs font-semibold text-slate-900 outline-none"
                    disabled={storyPosting}
                  >
                    {storyVisibilityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (storyPosting) return;
                      setStoryMediaPreviewOpen(false);
                      setStoryMediaDraftFile(null);
                      clearStoryMediaUploadState();
                      storyDeviceInputRef.current?.click();
                    }}
                    className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                    disabled={storyPosting}
                  >
                    Change media
                  </button>
                  <button
                    type="button"
                    onClick={publishStorySelectedMedia}
                    className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
                    disabled={storyPosting}
                  >
                    {storyPosting ? 'Publishing...' : 'Publish story'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {projectBriefOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
          <div className="w-full max-w-xl max-h-[92dvh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Scrolitha Project Brief</h3>
                <p className="text-xs text-slate-500">Describe your project and let AI prepare your draft brief.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (projectBriefGenerating) return;
                  setProjectBriefOpen(false);
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={projectBriefPrompt}
              onChange={(event) => setProjectBriefPrompt(event.target.value)}
              placeholder="e.g. I need a modern logo and brand kit for my coffee business..."
              className="mt-4 min-h-[140px] w-full rounded-2xl border border-slate-200 p-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
              disabled={projectBriefGenerating}
            />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {isGuest
                  ? 'Login or register is required before generating the final brief.'
                  : 'Your generated brief will be attached to the AI job creation flow.'}
              </p>
              <div className="flex items-center gap-2">
                {isGuest && (
                  <>
                    <button
                      type="button"
                      onClick={() => routeToAuth('login', 'project_brief')}
                      className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                    >
                      Login
                    </button>
                    <button
                      type="button"
                      onClick={() => routeToAuth('signup', 'project_brief')}
                      className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                    >
                      Register
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleFeaturedProjectBrief}
                  disabled={projectBriefGenerating || !projectBriefPrompt.trim()}
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
                >
                  {projectBriefGenerating ? 'Building...' : isGuest ? 'Login to Build Brief' : 'Build Brief'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {storyTextOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
          <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Text story</h3>
              <button onClick={() => setStoryTextOpen(false)} className="text-slate-500 hover:text-slate-700" type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div
                  className="flex h-44 sm:h-48 w-full items-center justify-center px-4 sm:px-5 text-center"
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
                className="min-h-[140px] w-full rounded-2xl border border-slate-200 p-3 text-sm text-slate-700"
              />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Background</p>
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
                      className={`h-8 w-8 rounded-full border ${storyDraft.textBackground === theme.background ? 'border-slate-900 ring-2 ring-slate-300' : 'border-white/70'} shadow-sm`}
                      style={{ background: theme.background }}
                      title={theme.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Font</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {storyTextFonts.map((font) => (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => setStoryDraft((prev) => ({ ...prev, textFont: font.fontFamily }))}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${storyDraft.textFont === font.fontFamily ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}
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
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-600"
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
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={publishStoryText}
                disabled={storyPosting || !storyDraft.content.trim()}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
              >
                {storyPosting ? 'Sharing...' : 'Share story'}
              </button>
            </div>
          </div>
        </div>
      )}

      {storyEditOpen && editingStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
          <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Edit story</h3>
              <button
                onClick={() => {
                  setStoryEditOpen(false);
                  setEditingStory(null);
                }}
                className="text-slate-500 hover:text-slate-700"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                {editingStory.type === 'text' ? (
                  <div
                    className="flex h-44 sm:h-48 w-full items-center justify-center px-4 sm:px-5 text-center"
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
                          className="h-44 sm:h-48 w-full object-cover"
                          containerClassName="h-44 sm:h-48 w-full"
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
                          className="h-44 sm:h-48 w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      );
                    }
                    return (
                      <div className="flex h-44 sm:h-48 w-full items-center justify-center text-sm text-slate-500">No media</div>
                    );
                  })()
                )}
              </div>

              <textarea
                value={storyEditDraft.content}
                onChange={(event) => setStoryEditDraft((prev) => ({ ...prev, content: event.target.value }))}
                placeholder={editingStory.type === 'text' ? 'Update your story...' : 'Add a caption (optional)'}
                className="min-h-[140px] w-full rounded-2xl border border-slate-200 p-3 text-sm text-slate-700"
              />

              {editingStory.type === 'text' && (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Background</p>
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
                            storyEditDraft.textBackground === theme.background ? 'border-slate-900 ring-2 ring-slate-300' : 'border-white/70'
                          } shadow-sm`}
                          style={{ background: theme.background }}
                          title={theme.label}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Font</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {storyTextFonts.map((font) => (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => setStoryEditDraft((prev) => ({ ...prev, textFont: font.fontFamily }))}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            storyEditDraft.textFont === font.fontFamily ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'
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
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-600"
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
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveStoryEdit}
                disabled={storyEditSaving || !storyEditDraft.content.trim() && editingStory.type === 'text'}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
              >
                {storyEditSaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
          <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Camera capture</h3>
              <button onClick={stopCamera} className="text-slate-500 hover:text-slate-700" type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl bg-slate-900">
              <video ref={cameraVideoRef} autoPlay playsInline className="h-56 sm:h-72 w-full object-cover" />
            </div>
            <canvas ref={cameraCanvasRef} className="hidden" />
            <div className="mt-4 flex items-center justify-between">
              <button onClick={stopCamera} className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600">
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button onClick={capturePhoto} className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white">
                  Capture Photo
                </button>
                {isRecording ? (
                  <button onClick={stopRecording} className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white">
                    Stop Recording
                  </button>
                ) : (
                  <button onClick={startRecording} className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Record Video
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {storyCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
          <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Story camera</h3>
              <button onClick={stopStoryCamera} className="text-slate-500 hover:text-slate-700" type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl bg-slate-900">
              <video ref={storyVideoRef} autoPlay playsInline className="h-56 sm:h-72 w-full object-cover" />
            </div>
            <canvas ref={storyCanvasRef} className="hidden" />
            <div className="mt-4 flex items-center justify-between">
              <button onClick={stopStoryCamera} className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600">
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button onClick={captureStoryPhoto} className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white">
                  Capture Photo
                </button>
                {storyRecording ? (
                  <button onClick={stopStoryRecording} className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white">
                    Stop Recording
                  </button>
                ) : (
                  <button onClick={startStoryRecording} className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Record Video
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeStory ? (
        <EnterpriseStoryViewer
          story={activeStory}
          stories={stories}
          viewer={user}
          onClose={() => setActiveStory(null)}
          onNavigate={(nextStory) => {
            if (!nextStory?.id) return;
            void openStory(nextStory);
          }}
          onEdit={() => openStoryEditor(activeStory)}
          onDelete={() => void handleStoryDelete(activeStory)}
          canManage={canManageStory(activeStory)}
          autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY}
        />
      ) : null}

      {expandedPost || previewMedia ? (
        <Suspense fallback={null}>
          {expandedPost ? (
            <PostExpandModal
              open={Boolean(expandedPost)}
              post={expandedPost}
              viewerId={user?.id}
              viewerUsername={user?.username}
              onClose={() => setExpandedPost(null)}
            />
          ) : null}

          {previewMedia ? (
            <MediaPreviewModal
              open={Boolean(previewMedia)}
              media={previewMedia}
              onClose={() => setPreviewMedia(null)}
            />
          ) : null}
        </Suspense>
      ) : null}
    </section>
  );
};

export default MemberHomeSection;
