import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  TrendingUp,
  Calendar,
  Award,
  MessageCircle,
  Filter,
  Search,
  Plus,
  Camera as CameraIcon,
  X,
  Heart,
  Repeat2,
  Send,
  Coins,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import DonateButton from '../components/DonateButton';
import { CommunityService } from '../services/community';
import { AdService } from '../services/ads';
import { ScrollService, type ScrollConfig, type ScrollVideo } from '../services/scroll';
import InlineAutoplayVideo from '../components/media/InlineAutoplayVideo';
import ScrollCreateModal from '../features/scroll/ScrollCreateModal';
import PostHeader from './components/PostHeader';
import PostEngagementBar from './components/PostEngagementBar';
import MentionText from './components/MentionText';
import ReactionBar from './components/ReactionBar';
import RepostModal from './components/RepostModal';
import PostShareModal from './components/PostShareModal';
import MentionHashtagTextarea from './components/MentionHashtagTextarea';
import PostOptionsButton from './components/post-options/PostOptionsButton';
import { applyFollowUpdatePayload, resetFollowState, setFollowStatuses, useFollowStateMap } from './followState';
import { useNotification } from '../context/NotificationContext';
import FilePickerModal from '../dashboard/shared/FilePickerModal';
import SendGcoinModal from '../components/SendGcoinModal';
import { FileService } from '../services/files';
import { getDefaultStoryTextDraft, getStoryTextStyle, storyTextFonts, storyTextThemes } from './storyStyles';
import { resolveAssetUrl } from '../utils/assetUrl';
import { Capacitor } from '@capacitor/core';
import { captureAndUpload } from '../mobile/uploads';
import { usePerformanceProfile } from '../hooks/usePerformanceProfile';

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

const resolveStoryMediaUrl = (story: any) => {
  const raw =
    story?.media?.url ||
    story?.mediaUrl ||
    story?.media_url ||
    story?.mediaFileUrl ||
    story?.media_file_url ||
    story?.media?.[0]?.url;
  if (raw) return resolveAssetUrl(raw);

  const fileId = story?.mediaFileId || story?.media_file_id;
  if (typeof fileId === 'string') {
    if (fileId.startsWith('disk:')) {
      const relative = fileId.slice('disk:'.length).replace(/^\/+/, '');
      return resolveAssetUrl(`/uploads/${relative}`);
    }
    if (fileId.startsWith('http://') || fileId.startsWith('https://')) {
      return resolveAssetUrl(fileId);
    }
  }
  return '';
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

const resolveStoryAuthorAvatar = (story: any) => {
  const raw =
    story?.authorAvatar ||
    story?.author?.avatarUrl ||
    story?.author?.avatar ||
    story?.authorPhoto ||
    story?.userAvatar ||
    story?.user_avatar ||
    story?.user?.avatarUrl ||
    story?.user?.avatar ||
    '';
  const normalized = String(raw || '').trim();
  return normalized ? resolveAssetUrl(normalized) : '';
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

const resolveReelMediaUrl = (scroll: ScrollVideo) => resolveAssetUrl(String(scroll?.media?.url || '').trim());

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
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [communityStats, setCommunityStats] = useState({
    members: 0,
    discussions: 0,
    topics: 0,
    events: 0
  });
  const [posts, setPosts] = useState<any[]>([]);
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
  const [storyPickerOpen, setStoryPickerOpen] = useState(false);
  const [storyTextOpen, setStoryTextOpen] = useState(false);
  const [storyPosting, setStoryPosting] = useState(false);
  const [activeStory, setActiveStory] = useState<any | null>(null);
  const [storyEditOpen, setStoryEditOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<any | null>(null);
  const [storyEditSaving, setStoryEditSaving] = useState(false);
  const [storyActionBusy, setStoryActionBusy] = useState<Record<string, boolean>>({});
  const [storyActionTarget, setStoryActionTarget] = useState<any | null>(null);
  const [storyCommentOpen, setStoryCommentOpen] = useState(false);
  const [storyCommentDraft, setStoryCommentDraft] = useState('');
  const [storyRepostOpen, setStoryRepostOpen] = useState(false);
  const [storySendOpen, setStorySendOpen] = useState(false);
  const [storyDashOpen, setStoryDashOpen] = useState(false);
  const [storyCameraOpen, setStoryCameraOpen] = useState(false);
  const [storyCameraStream, setStoryCameraStream] = useState<MediaStream | null>(null);
  const storyVideoRef = useRef<HTMLVideoElement | null>(null);
  const storyCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
  const storyPreviewStyle = getStoryTextStyle(storyDraft);
  const storyEditPreviewStyle = getStoryTextStyle(storyEditDraft);

  const openPostDetail = useCallback(
    (postId: string) => {
      const id = String(postId || '').trim();
      if (!id) return;
      navigate(`/post/${encodeURIComponent(id)}`);
    },
    [navigate]
  );

  const openPostFromText = useCallback(
    (event: React.MouseEvent<HTMLElement>, postId: string) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('a, button, input, textarea, select, label, video, audio')) return;
      openPostDetail(postId);
    },
    [openPostDetail]
  );

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
    const authorAvatar = post.authorAvatar || post.userAvatar || post.user_avatar || post.author?.avatarUrl || post.author?.avatar || '';
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
        id: item.id || item.fileId,
        url: item.url || item,
        name: item.name || item.originalName || item.filename,
        mimeType: item.mimeType || item.mime_type,
        type: item.type || inferMediaType(item)
      })),
      author: {
        id: post.author?.id || (authorType === 'business' ? post.businessPage?.id : authorId),
        username: post.author?.username ?? authorUsername,
        displayName: post.author?.displayName || authorName,
        avatarUrl: post.author?.avatarUrl || authorAvatar,
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
      isPinned: post.isPinned ?? post.is_pinned ?? false,
      isHighlighted: post.isHighlighted ?? post.is_highlighted ?? false,
      likesCount: post.likesCount ?? post.likes_count ?? interactions.likes,
      sharesCount: post.sharesCount ?? post.shares_count ?? interactions.shares,
      repostsCount: post.repostsCount ?? post.reposts_count ?? interactions.reposts,
      interactions,
      userState: post.userState || post.user_state || {}
    };
  }, []);

  const sortPosts = useCallback((items: any[]) => {
    return [...items].sort((a, b) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
        return a.isPinned ? -1 : 1;
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
      const merged = exists
        ? prev.map((item) =>
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
          )
        : [updated, ...prev];
      return sortPosts(merged);
    });
    if (updated.interactions?.comments !== undefined) {
      syncCommentCount(updated.id, updated.interactions?.comments);
    }
  }, [sortPosts, syncCommentCount]);

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
      try {
        setStoriesLoading(true);
        setReelsLoading(true);
        const postsLimit = Math.max(6, Math.min(40, Number(profile.feedPageSize || 20)));
        const reelsLimit = Math.max(6, Math.min(24, Number(profile.feedPageSize || 18)));
        const [feedPosts, ads, homepageConfig, storiesFeed, scrollFeed] = await Promise.all([
          CommunityService.getPosts({ limit: postsLimit }),
          AdService.getAds(user?.role),
          CommunityService.getCommunityHomepage(),
          CommunityService.getStoriesFeed(),
          ScrollService.getFeed({ limit: reelsLimit }).catch((error) => {
            console.warn('Failed to load reels feed on community home:', error);
            return { items: [] as ScrollVideo[] };
          }),
          loadCommunityOverview()
        ]);
        if (cancelled) return;
        const normalizedPosts = sortPosts((Array.isArray(feedPosts) ? feedPosts : []).map(normalizePost));
        setPosts(normalizedPosts);
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
          setFollowStatuses(followSeed);
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
        setCommentCounts(
          normalizedPosts.reduce((acc: Record<string, number>, post: any) => {
            acc[post.id] = post.interactions?.comments ?? 0;
            return acc;
          }, {})
        );
        setAds(ads);
        setHomepage(homepageConfig);
        setStories(filterActiveStories(Array.isArray(storiesFeed) ? storiesFeed : []));
        const nextReels = Array.isArray(scrollFeed?.items)
          ? scrollFeed.items.filter((item: ScrollVideo) => String(item?.status || '').toUpperCase() !== 'REMOVED').slice(0, reelsLimit)
          : [];
        setScrollConfig(scrollFeed?.config || null);
        setReels(nextReels);
      } catch (error) {
        console.error('Error loading community data:', error);
        setTrendingTopics([]);
        setUpcomingEvents([]);
        setTopContributors([]);
        setDiscussions([]);
        setAds([]);
        setPosts([]);
        setCommentCounts({});
        setHomepage(null);
        setStories([]);
        setScrollConfig(null);
        setReels([]);
      } finally {
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
        const newAds = await AdService.getAds(user?.role);
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
        setStories(filterActiveStories(Array.isArray(updated) ? updated : []));
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
    window.addEventListener('community:ad_status_updated', onAdEvent as EventListener);
    window.addEventListener('community:ad_created', onAdEvent as EventListener);
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
      window.removeEventListener('community:ad_status_updated', onAdEvent as EventListener);
      window.removeEventListener('community:ad_created', onAdEvent as EventListener);
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
  }, [applyStoryUpdate, filterActiveStories, normalizePost, profile.feedPageSize, sortPosts, user?.id, user?.role]);

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

    window.addEventListener('community:post_created', onPostCreated as EventListener);
    window.addEventListener('community:post_updated', onPostUpdated as EventListener);
    window.addEventListener('community:post_deleted', onPostDeleted as EventListener);
    window.addEventListener('community:post_metrics_updated', onPostMetricsUpdated as EventListener);
    window.addEventListener('community:post_reaction_updated', onPostReactionUpdated as EventListener);
    return () => {
      window.removeEventListener('community:post_created', onPostCreated as EventListener);
      window.removeEventListener('community:post_updated', onPostUpdated as EventListener);
      window.removeEventListener('community:post_deleted', onPostDeleted as EventListener);
      window.removeEventListener('community:post_metrics_updated', onPostMetricsUpdated as EventListener);
      window.removeEventListener('community:post_reaction_updated', onPostReactionUpdated as EventListener);
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
      setStories((prev) => filterActiveStories([created, ...prev]));
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

  const publishStoryFile = async (file: File, type: 'image' | 'video') => {
    if (!user) return;
    setStoryPosting(true);
    try {
      const uploaded = await FileService.uploadFile(file, 'community', {
        role: user.role,
        visibility: isPrivateStoryVisibility(storyDraft.visibility) ? 'private' : 'public',
        userId: user.id
      });
      const created = await CommunityService.createStory({
        type,
        mediaFileId: uploaded.id,
        visibility: storyDraft.visibility
      });
      setStories((prev) => filterActiveStories([created, ...prev]));
      showNotification('success', 'Stories', 'Your story is live.');
    } catch (error: any) {
      console.error(error);
      showNotification('error', 'Stories', error?.message || 'Unable to post story.');
    } finally {
      setStoryPosting(false);
    }
  };

  const startStoryCamera = async () => {
    if (!user) return;
    try {
      if (Capacitor.isNativePlatform()) {
        setStoryPosting(true);
        const uploaded = await captureAndUpload({
          category: 'community',
          role: user.role,
          visibility: isPrivateStoryVisibility(storyDraft.visibility) ? 'private' : 'public',
          userId: user.id
        });
        const created = await CommunityService.createStory({
          type: 'image',
          mediaFileId: uploaded.id,
          visibility: storyDraft.visibility
        });
        setStories((prev) => filterActiveStories([created, ...prev]));
        showNotification('success', 'Stories', 'Your story is live.');
        return;
      }
    } catch (error) {
      console.error(error);
      showNotification('error', 'Camera', 'Unable to access camera.');
      return;
    } finally {
      setStoryPosting(false);
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

  const handleStoryMediaSelected = async (file: any) => {
    if (!file?.id) return;
    setStoryPosting(true);
    try {
      const type = file.type === 'video' ? 'video' : 'image';
      const created = await CommunityService.createStory({
        type,
        mediaFileId: file.id,
        visibility: storyDraft.visibility
      });
      setStories((prev) => filterActiveStories([created, ...prev]));
      showNotification('success', 'Stories', 'Your story is live.');
    } catch (error: any) {
      console.error(error);
      showNotification('error', 'Stories', error?.message || 'Unable to post story.');
    } finally {
      setStoryPosting(false);
      setStoryPickerOpen(false);
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
      return response;
    },
    [applyStoryUpdate]
  );

  const buildStoryUrl = useCallback((storyId: string) => {
    if (typeof window === 'undefined') return `/community?story=${encodeURIComponent(storyId)}`;
    return `${window.location.origin}/community?story=${encodeURIComponent(storyId)}`;
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
      setStoryCommentDraft('');
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

  const submitStoryComment = useCallback(async () => {
    const story = storyActionTarget;
    const storyId = String(story?.id || '').trim();
    if (!storyId || storyActionBusy[storyId]) return;
    const content = String(storyCommentDraft || '').trim();
    if (!content) {
      showNotification('warning', 'Stories', 'Comment cannot be empty.');
      return;
    }
    setStoryActionBusy((prev) => ({ ...prev, [storyId]: true }));
    try {
      await CommunityService.createPost({
        content: `${content}\n\nCommented on story by ${resolveStoryAuthorName(story, 'Community member')}.\n${buildStoryUrl(storyId)}`
      });
      await engageStoryAndSync(story, 'comment');
      setStoryCommentOpen(false);
      setStoryCommentDraft('');
      showNotification('success', 'Stories', 'Comment shared to your feed.');
    } catch (error: any) {
      showNotification('error', 'Stories', error?.message || 'Unable to comment on this story.');
    } finally {
      setStoryActionBusy((prev) => ({ ...prev, [storyId]: false }));
    }
  }, [buildStoryUrl, engageStoryAndSync, showNotification, storyActionBusy, storyActionTarget, storyCommentDraft]);

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

  const activeStoryShareUrl = storyActionTarget?.id
    ? buildStoryUrl(String(storyActionTarget.id))
    : (typeof window === 'undefined' ? '/community' : `${window.location.origin}/community`);
  const activeStoryDashRecipient = String(
    storyActionTarget?.authorId || storyActionTarget?.author?.id || storyActionTarget?.userId || ''
  ).trim();

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
    navigate(`/my-ads?source=post&postId=${encodeURIComponent(postId)}`);
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
        commentPolicy: editingDraft.commentPolicy
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading Community...</p>
        </div>
      </div>
    );
  }

  const heroTitle = homepage?.hero?.title || 'Scrolith Community';
  const heroSubtitle = homepage?.hero?.subtitle || 'Connect with fellow freelancers, share knowledge, and grow together';
  const heroBackgroundImage = homepage?.hero?.backgroundImage;
  const heroBackgroundColor = homepage?.hero?.backgroundColor || '#4f46e5';
  const bannerEnabled = homepage?.banner?.enabled !== false;
  const bannerText = homepage?.banner?.text || 'Security Notice: Do not share sensitive personal information (Passwords, bank details, government IDs). AI Moderation is active in all chats.';
  const modules = homepage?.modules || {};
  const showHero = isVisibleForDevice(homepage?.hero?.visibility, viewportDevice);
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

  const showLeftSidebar = showTrendingTopics || showUpcomingEvents || showTopContributors;
  const showRightSidebar = showQuickActions || showSponsored || showStats;

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
          className="text-white py-10 sm:py-16"
          style={{
            backgroundImage: heroBackgroundImage ? `url(${heroBackgroundImage})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: heroBackgroundColor
          }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h1 className="text-2xl sm:text-4xl font-bold mb-3 sm:mb-4">{heroTitle}</h1>
              <p className="text-base sm:text-xl text-blue-100 max-w-2xl mx-auto">
                {heroSubtitle}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {showBanner && (
        <div className="bg-yellow-50 border-b border-yellow-100">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-start sm:items-center">
            <div className="text-sm text-yellow-800">{bannerText}</div>
          </div>
        </div>
      )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Sidebar */}
          {showLeftSidebar ? (
          <div className="lg:col-span-1 space-y-6 order-2 lg:order-none">
            {/* Trending Topics */}
            {showTrendingTopics && (
              <div className="bg-white rounded-xl shadow-sm p-6">
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
              <div className="bg-white rounded-xl shadow-sm p-6">
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
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center mb-4">
                  <Award className="w-5 h-5 text-yellow-600 mr-2" />
                  <h2 className="text-lg font-bold">{getModuleTitle(modules, 'topContributors', 'Top Contributors')}</h2>
                </div>
                <div className="space-y-3">
                  {topContributors.map((contributor) => (
                    <div key={contributor.id} className="flex items-center p-2 hover:bg-gray-50 rounded-lg">
                      <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                        <span className="font-bold">{contributor.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{contributor.name}</div>
                        <div className="text-sm text-gray-500">{contributor.reputation} rep</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          ) : null}

          {/* Main Content */}
          <div className={`${mainColSpanClass} space-y-6 order-1 lg:order-none`}>
            {showSliders && visibleSliders.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="mb-2 text-sm font-bold text-gray-900">
                  {getModuleTitle(modules, 'sliders', 'Featured')}
                </div>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {visibleSliders.map((slide: any) => (
                    <div key={slide.id} className="min-w-[260px] border rounded-lg overflow-hidden">
                      {slide.imageUrl && (
                        <img src={slide.imageUrl} alt={slide.title || 'Slide'} className="w-full h-32 object-cover" />
                      )}
                      {slide.videoUrl && (
                        <video src={slide.videoUrl} controls className="w-full h-32 object-cover" />
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
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
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
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={storyDraft.visibility}
                        onChange={(event) =>
                          setStoryDraft((prev) => ({ ...prev, visibility: normalizeStoryVisibility(event.target.value) }))
                        }
                        className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600"
                      >
                        {storyVisibilityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setStoryTextOpen(true)}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600"
                        disabled={storyPosting}
                      >
                        Text story
                      </button>
                      <button
                        onClick={() => setStoryPickerOpen(true)}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600"
                        disabled={storyPosting}
                      >
                        <Plus className="h-3 w-3" />
                        Upload
                      </button>
                      <button
                        onClick={startStoryCamera}
                        className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white"
                        disabled={storyPosting}
                      >
                        <CameraIcon className="h-3 w-3" />
                        Camera
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setScrollCreateOpen(true)}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white"
                    >
                      <Plus className="h-3 w-3" />
                      Create Scroll
                    </button>
                  )}
                </div>

                {storyRailTab === 'stories' ? (
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    <button
                      onClick={() => setStoryPickerOpen(true)}
                      className="min-w-[120px] h-44 rounded-2xl border border-dashed border-gray-300 flex flex-col items-center justify-center text-xs text-gray-500"
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
                          className="min-w-[120px] h-44 rounded-2xl overflow-hidden border border-gray-200 bg-gray-100 relative"
                        >
                          {(() => {
                            const mediaUrl = resolveStoryMediaUrl(story);
                            if (mediaUrl) {
                              return story.type === 'video' ? (
                                <video
                                  src={mediaUrl}
                                  className="h-full w-full object-cover"
                                  autoPlay
                                  muted
                                  playsInline
                                  loop
                                  preload="metadata"
                                />
                              ) : (
                                <img src={mediaUrl} alt="Story" className="h-full w-full object-cover" />
                              );
                            }
                            const text = resolveStoryContent(story);
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
                                  <span className="line-clamp-4 whitespace-pre-wrap">{text}</span>
                                </div>
                              );
                            }
                            return (
                              <div className="h-full w-full flex items-center justify-center text-xs text-gray-500">Story</div>
                            );
                          })()}
                          {(() => {
                            const authorName = resolveStoryAuthorName(story, 'Community');
                            const authorAvatar = resolveStoryAuthorAvatar(story);
                            const authorInitial = resolveStoryAuthorInitial(story);
                            return (
                              <div className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-white/90 bg-slate-700 text-[11px] font-semibold text-white shadow">
                                {authorAvatar ? (
                                  <img src={authorAvatar} alt={authorName} className="h-full w-full object-cover" />
                                ) : (
                                  <span>{authorInitial}</span>
                                )}
                              </div>
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
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    <button
                      type="button"
                      onClick={() => setScrollCreateOpen(true)}
                      className="min-w-[120px] h-44 rounded-2xl border border-dashed border-gray-300 flex flex-col items-center justify-center text-xs text-gray-500"
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
                          className="relative min-w-[120px] h-44 overflow-hidden rounded-2xl border border-gray-200 bg-gray-900"
                        >
                          {(() => {
                            const mediaUrl = resolveReelMediaUrl(scroll);
                            if (!mediaUrl) {
                              return (
                                <div className="h-full w-full flex items-center justify-center text-xs text-white/75">
                                  Scroll
                                </div>
                              );
                            }
                            return (
                              <video
                                src={mediaUrl}
                                className="h-full w-full object-cover"
                                autoPlay
                                muted
                                playsInline
                                loop
                                preload="metadata"
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
                                  <img src={authorAvatar} alt={authorName} className="h-full w-full object-cover" />
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

            {showCustomSections && visibleSections.length > 0 && (
              <div className="space-y-4">
                {visibleSections.map((section: any) => (
                  <div key={section.id} className="bg-white rounded-xl shadow-sm p-4">
                    {section.title && <h3 className="text-lg font-semibold">{section.title}</h3>}
                    {section.body && <p className="text-sm text-gray-600 mt-2">{section.body}</p>}
                    {section.type === 'image' && section.imageUrl && (
                      <img src={section.imageUrl} alt={section.title || 'Section'} className="mt-3 rounded-lg w-full object-cover" />
                    )}
                    {section.type === 'video' && section.videoUrl && (
                      <video src={section.videoUrl} controls className="mt-3 rounded-lg w-full" />
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Search Bar */}
            {showSearchBar && (
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center">
                  <Search className="w-5 h-5 text-gray-400 mr-3" />
                  <input
                    type="text"
                    placeholder="Search discussions, topics, or people..."
                    className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button className="ml-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <Filter className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Community Feed */}
            {showFeed && (
              <div className="bg-white rounded-xl shadow-sm">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-bold">{getModuleTitle(modules, 'feed', 'Community Feed')}</h2>
                <Link to="/community" className="text-sm text-blue-600 hover:text-blue-800">Create Post</Link>
              </div>
              <div className="divide-y divide-gray-200">
                {posts.length === 0 && (
                  <div className="p-4 text-sm text-gray-500">No posts yet.</div>
                )}
                {posts.map((post) => {
                  const ownerUserId = resolveAuthorOwnerUserId(post);
                  const isOwner = Boolean(ownerUserId) && String(user?.id || '') === ownerUserId;
                  const canManage = isOwner || isPrivilegedRole(user?.role);
                  const isEditing = editingPostId === post.id;
                  const actionBusy = Boolean(postActionBusy[post.id]);
                  const commentCount = commentCounts[post.id] ?? post.interactions?.comments ?? 0;
                  const resolvedAuthor = {
                    id: post.author?.id || post.authorId,
                    username: post.author?.username ?? post.authorUsername,
                    displayName: post.author?.displayName || post.authorName,
                    avatarUrl: post.author?.avatarUrl || post.authorAvatar,
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
                    <div
                      key={post.id}
                      id={`community-post-${post.id}`}
                      className={`p-4 transition-shadow ${focusPostId === post.id ? 'bg-blue-50/30' : ''}`}
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
                          </>
                        }
                        rightSlot={
                          <div className="flex items-center gap-2">
                            {canManage ? (
                              <button
                                onClick={() => promotePost(post)}
                                className="text-xs px-2 py-1 border rounded text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                type="button"
                              >
                                Promote this post
                              </button>
                            ) : null}
                            <PostOptionsButton
                              post={post}
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
                                      <video src={media.url} className="h-40 w-full object-cover" controls />
                                    ) : type === 'image' ? (
                                      <img src={media.url} alt={media.name || 'Post media'} className="h-40 w-full object-cover" />
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
                          {post.title ? (
                            <button
                              type="button"
                              onClick={() => openPostDetail(post.id)}
                              className="mt-3 text-left font-semibold text-gray-900 hover:text-blue-700 hover:underline"
                            >
                              {post.title}
                            </button>
                          ) : null}
                          {focusPostId === post.id && focusMentionToken ? (
                            <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                              You were mentioned in this post.
                            </div>
                          ) : null}
                          <div
                            className="mt-2 cursor-pointer text-sm text-gray-700"
                            role="button"
                            tabIndex={0}
                            onClick={(event) => openPostFromText(event, post.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openPostDetail(post.id);
                              }
                            }}
                          >
                            <MentionText
                              text={post.content}
                              mentionToken={focusPostId === post.id ? focusMentionToken : undefined}
                              viewerId={user?.id}
                              viewerUsername={user?.username}
                            />
                          </div>
                          {post.tags?.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {post.tags.map((tag: string) => (
                                <span key={tag} className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-600">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {Array.isArray(post.attachments) && post.attachments.length > 0 && (
                            <div
                              className={`mt-3 grid gap-3 ${
                                post.attachments.length === 1 ? 'grid-cols-1' : 'md:grid-cols-2'
                              }`}
                            >
                              {post.attachments.map((media: any) => {
                                const type = inferMediaType(media || {});
                                const mediaHeightClass =
                                  post.attachments.length === 1 ? 'h-64 md:h-80' : 'h-44 md:h-52';
                                if (type === 'video') {
                                  return (
                                    <div
                                      key={media.id || media.url}
                                      className="mx-auto w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
                                    >
                                      <InlineAutoplayVideo
                                        src={media.url}
                                        poster={media.thumbnailUrl || undefined}
                                        className={`${mediaHeightClass} w-full object-cover`}
                                        controls
                                        autoplayEnabled={profile.autoplayEnabled}
                                        preload="metadata"
                                      />
                                    </div>
                                  );
                                }
                                if (type === 'image') {
                                  return (
                                    <button
                                      key={media.id || media.url}
                                      type="button"
                                      onClick={() => openPostDetail(post.id)}
                                      className="mx-auto w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 text-left"
                                    >
                                      <img
                                        src={media.url}
                                        alt={media.name || 'Post media'}
                                        className={`${mediaHeightClass} w-full object-cover`}
                                      />
                                    </button>
                                  );
                                }
                                return (
                                  <div
                                    key={media.id || media.url}
                                    className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600"
                                  >
                                    <a href={media.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                                      {media.name || media.url?.split('/').pop() || 'View attachment'}
                                    </a>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {(post.topic || post.location) && (
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
                              {post.topic && (
                                <span className="rounded-full bg-gray-50 px-3 py-1 font-semibold text-gray-600">Topic: {post.topic}</span>
                              )}
                              {post.location && (
                                <span className="rounded-full bg-gray-50 px-3 py-1 font-semibold text-gray-600">Location: {post.location}</span>
                              )}
                            </div>
                          )}
                          <PostEngagementBar
                            postId={post.id}
                            authorId={post.authorUserId || post.authorId}
                            commentPolicy={post.commentPolicy}
                            commentCount={commentCount}
                            repostCount={post.repostsCount ?? post.interactions?.reposts ?? 0}
                            shareCount={post.sharesCount ?? post.interactions?.shares ?? 0}
                            viewCount={post.interactions?.views ?? post.viewsCount ?? 0}
                            initialReactionCounts={post.interactions?.reactions}
                            initialUserReaction={post.userState?.reaction}
                            focusCommentId={focusPostId === post.id ? focusCommentId : undefined}
                            focusMentionToken={focusPostId === post.id ? focusMentionToken : undefined}
                            onCommentCountChange={syncCommentCount}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            )}

            {/* Discussions List */}
            {showDiscussions && (
            <div className="bg-white rounded-xl shadow-sm">
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
          <div className="lg:col-span-1 space-y-6 order-3 lg:order-none">
            {/* Quick Actions */}
            {showQuickActions && (
            <div className="bg-white rounded-xl shadow-sm p-6">
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

            {/* Ads/Sponsored */}
            {showSponsored && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-bold mb-4">{getModuleTitle(modules, 'sponsored', 'Sponsored')}</h2>
              <div className="space-y-4">
                {ads.map((ad) => {
                  const media =
                    (Array.isArray(ad.media) && ad.media.length > 0 ? ad.media[0] : null) ||
                    (ad.creativeUrl ? { url: ad.creativeUrl, type: 'image' } : null);
                  const mediaType = media ? inferMediaType(media) : null;

                  return (
                    <div key={ad.id} className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-medium text-gray-900">{ad.title}</h3>
                      <p className="text-sm text-gray-600 mt-2">{ad.description || ad.body}</p>
                      {media?.url && (
                        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                          {mediaType === 'video' ? (
                            <video src={media.url} controls className="h-36 w-full object-cover" />
                          ) : (
                            <img src={media.url} alt={ad.title || 'Ad media'} className="h-36 w-full object-cover" />
                          )}
                        </div>
                      )}
                      <div className="mt-3 flex items-center gap-3">
                        <a
                          href={ad.ctaUrl || '#'}
                          className="text-sm text-blue-600 hover:text-blue-800"
                          onClick={() => AdService.recordClick(ad.id).catch(() => {})}
                        >
                          {ad.ctaText || 'Learn more'}
                        </a>
                        {/* If ad has creator/recipient info, show Donate button */}
                        {(ad.creatorId || ad.recipientId) && (
                          // @ts-ignore - loosely typed CMS ad object may include creatorId/recipientId
                          <DonateButton recipientIdentifier={ad.creatorId || ad.recipientId} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            {/* Stats */}
            {showStats && (
            <div className="bg-white rounded-xl shadow-sm p-6">
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

      <FilePickerModal
        open={storyPickerOpen}
        onClose={() => setStoryPickerOpen(false)}
        onSelect={handleStoryMediaSelected}
        allowUpload
        multiple={false}
        filterType="all"
        acceptedTypes={['image', 'video']}
        title="Add to your story"
        role={user?.role}
        visibility={isPrivateStoryVisibility(storyDraft.visibility) ? 'private' : 'public'}
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
                    const mediaUrl = resolveStoryMediaUrl(editingStory);
                    if (mediaUrl) {
                      return editingStory.type === 'video' ? (
                        <video
                          src={mediaUrl}
                          controls
                          autoPlay
                          muted
                          playsInline
                          loop
                          preload="metadata"
                          className="h-48 w-full object-cover"
                        />
                      ) : (
                        <img src={mediaUrl} alt="Story media" className="h-48 w-full object-cover" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6">
          <div className="w-full max-w-xl max-h-[94dvh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(() => {
                  const authorName = resolveStoryAuthorName(activeStory, 'Community member');
                  const authorAvatar = resolveStoryAuthorAvatar(activeStory);
                  const authorInitial = resolveStoryAuthorInitial(activeStory);
                  return (
                    <>
                      <div className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-slate-700 text-xs font-semibold text-white">
                        {authorAvatar ? (
                          <img src={authorAvatar} alt={authorName} className="h-full w-full object-cover" />
                        ) : (
                          <span>{authorInitial}</span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{authorName}</p>
                        <p className="text-xs text-gray-500">{activeStory.createdAt ? new Date(activeStory.createdAt).toLocaleString() : ''}</p>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                {canManageStory(activeStory) && (
                  <>
                    <button
                      onClick={() => openStoryEditor(activeStory)}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:text-gray-800"
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleStoryDelete(activeStory)}
                      className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 hover:text-red-600"
                      type="button"
                      disabled={storyActionBusy[activeStory.id]}
                    >
                      Delete
                    </button>
                  </>
                )}
                <button onClick={() => setActiveStory(null)} className="text-sm text-gray-500 hover:text-gray-700">
                  Close
                </button>
              </div>
            </div>
            <div className="relative mt-4 overflow-hidden rounded-2xl bg-gray-100 aspect-[9/16] sm:aspect-[9/14]">
              {(() => {
                const mediaUrl = resolveStoryMediaUrl(activeStory);
                if (mediaUrl) {
                  return activeStory.type === 'video' ? (
                    <video
                      src={mediaUrl}
                      autoPlay
                      muted
                      playsInline
                      loop
                      preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <img src={mediaUrl} alt="Story" className="h-full w-full object-cover" />
                    );
                  }
                const text = resolveStoryContent(activeStory);
                if (text) {
                  const style = getStoryTextStyle(activeStory);
                  return (
                    <div
                      className="flex h-full w-full items-center justify-center px-4 sm:px-6 text-center"
                      style={{
                        background: style.background,
                        color: style.color,
                        fontFamily: style.fontFamily,
                        textAlign: style.textAlign as any
                      }}
                    >
                      <p className="text-lg font-semibold leading-snug whitespace-pre-wrap">{text}</p>
                    </div>
                  );
                }
                return <div className="h-full w-full flex items-center justify-center text-sm text-gray-500">No media</div>;
              })()}
              <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2">
                <button
                  type="button"
                  className={`pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white transition ${
                    hasPrevStory ? 'hover:bg-black/65' : 'cursor-not-allowed opacity-35'
                  }`}
                  onClick={() => goToStoryByOffset(-1)}
                  disabled={!hasPrevStory}
                  aria-label="Previous story"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className={`pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white transition ${
                    hasNextStory ? 'hover:bg-black/65' : 'cursor-not-allowed opacity-35'
                  }`}
                  onClick={() => goToStoryByOffset(1)}
                  disabled={!hasNextStory}
                  aria-label="Next story"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
            {(() => {
              const text = resolveStoryContent(activeStory);
              const mediaUrl = resolveStoryMediaUrl(activeStory);
              if (text && mediaUrl) {
                return <p className="mt-3 text-sm text-gray-700">{text}</p>;
              }
              return null;
            })()}
            <ReactionBar targetType="STORY" targetId={activeStory.id} className="mt-4" />
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleStoryCommentAction(activeStory)}
                className="inline-flex items-center justify-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                disabled={Boolean(storyActionBusy[activeStory.id])}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Comment
              </button>
              <button
                type="button"
                onClick={() => handleStoryRepostAction(activeStory)}
                className="inline-flex items-center justify-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                disabled={Boolean(storyActionBusy[activeStory.id])}
              >
                <Repeat2 className="h-3.5 w-3.5" />
                Repost
              </button>
              <button
                type="button"
                onClick={() => handleStoryDashAction(activeStory)}
                className="inline-flex items-center justify-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                disabled={Boolean(storyActionBusy[activeStory.id])}
              >
                <Coins className="h-3.5 w-3.5" />
                Dash
              </button>
              <button
                type="button"
                onClick={() => handleStorySendAction(activeStory)}
                className="inline-flex items-center justify-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                disabled={Boolean(storyActionBusy[activeStory.id])}
              >
                <Send className="h-3.5 w-3.5" />
                Send
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
              <button
                onClick={() => handleStoryLike(activeStory)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${activeStory.viewerLiked ? 'border-rose-200 text-rose-600' : 'border-gray-200 text-gray-500'}`}
                disabled={storyActionBusy[activeStory.id]}
                type="button"
              >
                <Heart className={`h-4 w-4 ${activeStory.viewerLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                {activeStory.likesCount ?? activeStory._count?.likes ?? 0}
              </button>
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <span>{formatCompactCount(activeStory.commentsCount ?? activeStory.interactions?.comments)} comments</span>
                <span>{formatCompactCount(activeStory.repostsCount ?? activeStory.interactions?.reposts)} reposts</span>
                <span>{formatCompactCount(activeStory.sendsCount ?? activeStory.interactions?.sends)} sends</span>
                <span>{normalizeStoryVisibility(activeStory.visibility)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {storyCommentOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setStoryCommentOpen(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 text-gray-900 shadow-2xl">
            <h3 className="text-base font-semibold">Comment on story</h3>
            <p className="mt-1 text-xs text-gray-500">Your comment will be shared to your feed and linked to this story.</p>
            <textarea
              value={storyCommentDraft}
              onChange={(event) => setStoryCommentDraft(event.target.value)}
              rows={4}
              placeholder="Write your comment..."
              className="mt-4 w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-700"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStoryCommentOpen(false)}
                className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitStoryComment()}
                className="rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold uppercase text-white"
                disabled={Boolean(storyActionBusy[String(storyActionTarget?.id || '')])}
              >
                {storyActionBusy[String(storyActionTarget?.id || '')] ? 'Posting...' : 'Comment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <RepostModal
        isOpen={storyRepostOpen}
        onClose={() => setStoryRepostOpen(false)}
        busy={Boolean(storyActionBusy[String(storyActionTarget?.id || '')])}
        onRepostNow={async () => repostStory()}
        onRepostWithComment={async (comment) => repostStory(comment)}
      />

      <PostShareModal
        isOpen={storySendOpen}
        onClose={() => setStorySendOpen(false)}
        postUrl={activeStoryShareUrl}
        entityLabel="story"
        shareText={
          storyActionTarget?.id
            ? `Check this story on Scrolith: ${activeStoryShareUrl}`
            : 'Check this story on Scrolith'
        }
        onShareToNetwork={() => {
          if (!storyActionTarget?.id) return;
          setStorySendOpen(false);
          setStoryRepostOpen(true);
        }}
        onTrackedShare={async () => {
          if (!storyActionTarget?.id) return;
          await engageStoryAndSync(storyActionTarget, 'send');
        }}
      />

      <SendGcoinModal
        isOpen={storyDashOpen}
        onClose={() => setStoryDashOpen(false)}
        prefillRecipientId={activeStoryDashRecipient || undefined}
        titleOverride="Dash Story Creator"
        subtitleOverride="Support this story creator instantly with your Gcoin balance."
        onSuccess={async () => {
          if (!storyActionTarget?.id) return;
          await engageStoryAndSync(storyActionTarget, 'dash');
        }}
      />
    </div>
  );
};

export default CommunityHome;

