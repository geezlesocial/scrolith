import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenterIcon as AlignCenter,
  AlignLeftIcon as AlignLeft,
  AlignRightIcon as AlignRight,
  Edit3Icon as Edit3,
  EyeIcon as Eye,
  ImageIcon,
  Loader2Icon as Loader2,
  MoreVerticalIcon as MoreVertical,
  PlusIcon as Plus,
  Trash2Icon as Trash2,
  TypeIcon as Type,
  VideoIcon as Video,
  XIcon as X
} from '../../../components/icons/ShellIcons';
import { ChevronLeft, ChevronRight, Coins, Download, MessageCircle, Radio, Repeat2, Send, Volume2, VolumeX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useUser } from '../../../context/UserContext';
import { useLiveFeature } from '../../../context/LiveFeatureContext';
import { useNotification } from '../../../context/NotificationContext';
import { CommunityService } from '../../../services/community';
import { FileService } from '../../../services/files';
import { ScrollService, type ScrollConfig, type ScrollVideo } from '../../../services/scroll';
import { getDefaultStoryTextDraft, getStoryTextStyle, storyTextFonts, storyTextThemes } from '../../../community/storyStyles';
import FollowButton from '../../../community/components/FollowButton';
import { UploadedFile } from '../../../types';
import ScrollCreateModal from '../../../features/scroll/ScrollCreateModal';
import ExpandablePreviewText from '../../../components/common/ExpandablePreviewText';
import StaticPreviewText from '../../../components/common/StaticPreviewText';
import InlineAutoplayVideo from '../../../components/media/InlineAutoplayVideo';
import { resolveInlineMedia } from '../../../utils/inlineMedia';
import { downloadToDevice } from '../../../utils/deviceDownload';
import { resolvePostAttachmentMediaUrl } from '../../../utils/postAttachmentMedia';
import ReactionBar from '../../../community/components/ReactionBar';
import OverlayActionRailButton from '../../../components/media/OverlayActionRailButton';
import { usePerformanceProfile } from '../../../hooks/usePerformanceProfile';
import RepostModal from '../../../community/components/RepostModal';
import PostShareModal from '../../../community/components/PostShareModal';
import SendGcoinModal from '../../../components/SendGcoinModal';
import { LiveService, type LiveSession } from '../../../services/live';
import { buildPublicAppUrl } from '../../../utils/siteUrl';

type StoryKind = 'text' | 'image' | 'video';
type StoryVisibility = 'public' | 'private';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const STORY_CONTROL_HIDE_DELAY_MS = 20000;

const normalizeVisibility = (value: any): StoryVisibility => {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'private' ? 'private' : 'public';
};

const resolveStoryType = (story: any): StoryKind => {
  const raw = String(story?.type || '').trim().toLowerCase();
  if (raw === 'video') return 'video';
  if (raw === 'image') return 'image';
  return 'text';
};

const resolveStoryOwnerId = (story: any) =>
  String(story?.authorId || story?.userId || story?.user_id || story?.author?.id || '').trim();

const resolveStoryContent = (story: any) =>
  String(story?.content ?? story?.caption ?? story?.text ?? story?.storyText ?? story?.story_text ?? '').trim();

const isStoryActive = (story: any) => {
  if (!story?.expiresAt) return true;
  const expiresAt = new Date(story.expiresAt).getTime();
  return Number.isNaN(expiresAt) ? true : expiresAt > Date.now();
};

const resolveStoryMediaUrl = (story: any) => {
  const media = resolveInlineMedia(story, { typeHint: story?.type });
  return {
    isVideo: media.kind === 'video',
    url: media.src || null,
    thumbnailUrl: media.poster || null
  };
};

const resolveStoryAuthorName = (story: any, fallback = 'Story') => {
  const normalized = String(story?.authorName || story?.author?.name || '').trim();
  return normalized || fallback;
};

const resolveStoryAuthorAvatar = (story: any) => {
  const normalized = String(story?.authorAvatar || story?.author?.avatar || '').trim();
  return normalized ? resolvePostAttachmentMediaUrl(normalized) : '';
};

const resolveStoryAuthorInitial = (story: any) => {
  const first = resolveStoryAuthorName(story, 'S').replace(/^@+/, '').trim().charAt(0).toUpperCase();
  return first || 'S';
};

const formatCompactCount = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0';
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1).replace(/\.0$/, '')}M+`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1).replace(/\.0$/, '')}k+`;
  return String(Math.trunc(numeric));
};

const resolveScrollMedia = (scroll: ScrollVideo) => {
  const media = resolveInlineMedia(scroll?.media || scroll, { typeHint: 'video' });
  return {
    url: media.src || '',
    poster: media.poster || undefined
  };
};

const resolveScrollAuthorName = (scroll: ScrollVideo, fallback = 'Scrolith') => {
  const normalized = String(scroll?.author?.name || '').trim();
  return normalized || fallback;
};

const resolveScrollAuthorAvatar = (scroll: ScrollVideo) => {
  const normalized = String(scroll?.author?.avatar || '').trim();
  return normalized ? resolvePostAttachmentMediaUrl(normalized) : '';
};

const resolveScrollAuthorInitial = (scroll: ScrollVideo) => {
  const first = resolveScrollAuthorName(scroll, 'S').replace(/^@+/, '').trim().charAt(0).toUpperCase();
  return first || 'S';
};

const canManageStory = (story: any, user: any) => {
  if (!story || !user?.id) return false;
  const role = String(user?.role || '').toLowerCase();
  if (role.includes('admin') || role.includes('moderator')) return true;
  return resolveStoryOwnerId(story) === String(user.id);
};

const updateStoryList = (prev: any[], next: any, maxItems: number) => {
  const list = Array.isArray(prev) ? prev : [];
  if (!next?.id) return list;
  const out = list.some((s) => String(s?.id) === String(next.id))
    ? list.map((s) => (String(s?.id) === String(next.id) ? { ...s, ...next } : s))
    : [next, ...list];
  return out.filter(isStoryActive).slice(0, maxItems);
};

const removeStoryFromList = (prev: any[], storyId: string) => {
  const list = Array.isArray(prev) ? prev : [];
  return list.filter((s) => String(s?.id) !== String(storyId));
};

const STORIES_CACHE_VERSION = 'v2';
const LIVE_CACHE_TTL_MS = 90 * 1000;
const withFastFail = async <T,>(promise: Promise<T>, timeoutMs: number, fallbackMessage: string): Promise<T> => {
  let timer: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(fallbackMessage)), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== null) window.clearTimeout(timer);
  }
};

const Sheet = ({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/50 p-3"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const SheetItem = ({
  icon,
  label,
  danger,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold',
      danger ? 'text-red-700 hover:bg-red-50' : 'text-slate-800 hover:bg-slate-50'
    ].join(' ')}
  >
    <div className={['rounded-xl p-2', danger ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'].join(' ')}>
      {icon}
    </div>
    <span>{label}</span>
  </button>
);

export default function MobileStoriesStrip({ settings }: { settings?: any }) {
  const navigate = useNavigate();
  const { user } = useUser();
  const { status: liveFeatureStatus } = useLiveFeature();
  const { showNotification } = useNotification();
  const { profile } = usePerformanceProfile();
  const currentUserId = String(user?.id || 'guest').trim() || 'guest';
  const storiesCacheKey = useMemo(() => `mobile_stories:${STORIES_CACHE_VERSION}:${currentUserId}`, [currentUserId]);
  const scrollCacheKey = useMemo(() => `mobile_scrolls:${STORIES_CACHE_VERSION}:${currentUserId}`, [currentUserId]);
  const liveCacheKey = useMemo(() => `mobile_live:${STORIES_CACHE_VERSION}:${currentUserId}`, [currentUserId]);

  const enabled = settings?.stories?.enabled !== false;
  const maxItems = clamp(Number(settings?.stories?.maxItems ?? 12) || 12, 4, 40);
  const maxScrollItems = clamp(Number(settings?.stories?.maxReels ?? settings?.stories?.maxItems ?? 12) || 12, 4, 40);
  const lightweightRailMode = profile.lowBandwidth || profile.dataSaver;
  const previewAutoplayEnabled = profile.autoplayEnabled && !lightweightRailMode;

  const [stories, setStories] = useState<any[]>([]);
  const [scrolls, setScrolls] = useState<ScrollVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [scrollsLoading, setScrollsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrollError, setScrollError] = useState<string | null>(null);
  const [activeStory, setActiveStory] = useState<any | null>(null);
  const [storyRailTab, setStoryRailTab] = useState<'stories' | 'scroll' | 'live'>('stories');
  const [scrollCreateOpen, setScrollCreateOpen] = useState(false);
  const [scrollConfig, setScrollConfig] = useState<ScrollConfig | null>(null);
  const [storiesReloadTick, setStoriesReloadTick] = useState(0);
  const [scrollReloadTick, setScrollReloadTick] = useState(0);
  const [liveReloadTick, setLiveReloadTick] = useState(0);
  const [scrollRailPrimed, setScrollRailPrimed] = useState(false);
  const [liveRailPrimed, setLiveRailPrimed] = useState(false);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [storyPreviewMediaErrors, setStoryPreviewMediaErrors] = useState<Record<string, boolean>>({});

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerStep, setComposerStep] = useState<'choose' | 'compose'>('choose');
  const [composerMode, setComposerMode] = useState<'create' | 'edit'>('create');
  const [editingStory, setEditingStory] = useState<any | null>(null);
  const [draftType, setDraftType] = useState<StoryKind | null>(null);
  const [draftVisibility, setDraftVisibility] = useState<StoryVisibility>('public');
  const [draftContent, setDraftContent] = useState('');
  const [draftMediaFile, setDraftMediaFile] = useState<UploadedFile | null>(null);
  const [draftTextStyle, setDraftTextStyle] = useState(() => getDefaultStoryTextDraft());
  const [publishing, setPublishing] = useState(false);
  const [mediaUploadBusy, setMediaUploadBusy] = useState(false);
  const [mediaUploadLabel, setMediaUploadLabel] = useState('');
  const [storyActionTarget, setStoryActionTarget] = useState<any | null>(null);
  const [storyCommentOpen, setStoryCommentOpen] = useState(false);
  const [storyCommentDraft, setStoryCommentDraft] = useState('');
  const [storyRepostOpen, setStoryRepostOpen] = useState(false);
  const [storySendOpen, setStorySendOpen] = useState(false);
  const [storyDashOpen, setStoryDashOpen] = useState(false);
  const [storyActionBusy, setStoryActionBusy] = useState<Record<string, boolean>>({});
  const storyDeviceInputRef = useRef<HTMLInputElement | null>(null);
  const storyCameraInputRef = useRef<HTMLInputElement | null>(null);
  const railGestureStartRef = useRef<{ key: string; x: number; y: number } | null>(null);
  const railTouchStartRef = useRef<{ key: string; x: number; y: number } | null>(null);
  const recentRailActionRef = useRef<{ key: string; at: number } | null>(null);

  const visibleStories = useMemo(() => {
    const list = Array.isArray(stories) ? stories : [];
    return list.filter(isStoryActive).slice(0, maxItems);
  }, [stories, maxItems]);

  const runRailAction = useCallback((key: string, action: () => void) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      action();
      return;
    }
    const now = Date.now();
    const previous = recentRailActionRef.current;
    if (previous?.key === normalizedKey && now - previous.at < 450) return;
    recentRailActionRef.current = { key: normalizedKey, at: now };
    action();
  }, []);

  const beginRailGesture = useCallback((key: string, event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') return;
    railGestureStartRef.current = {
      key: String(key || '').trim(),
      x: event.clientX,
      y: event.clientY
    };
  }, []);

  const cancelRailGesture = useCallback(() => {
    railGestureStartRef.current = null;
    railTouchStartRef.current = null;
  }, []);

  const commitRailGesture = useCallback(
    (key: string, event: React.PointerEvent<HTMLElement>, action: () => void) => {
      if (event.pointerType === 'touch') return;
      const normalizedKey = String(key || '').trim();
      const start = railGestureStartRef.current;
      railGestureStartRef.current = null;
      if (!start || start.key !== normalizedKey) return;
      const deltaX = Math.abs(event.clientX - start.x);
      const deltaY = Math.abs(event.clientY - start.y);
      if (Math.max(deltaX, deltaY) > 28) return;
      runRailAction(normalizedKey, action);
    },
    [runRailAction]
  );

  const beginRailTouch = useCallback((key: string, event: React.TouchEvent<HTMLElement>) => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    railTouchStartRef.current = {
      key: String(key || '').trim(),
      x: touch.clientX,
      y: touch.clientY
    };
  }, []);

  const commitRailTouch = useCallback(
    (key: string, event: React.TouchEvent<HTMLElement>, action: () => void) => {
      const normalizedKey = String(key || '').trim();
      const start = railTouchStartRef.current;
      railTouchStartRef.current = null;
      const touch = event.changedTouches?.[0];
      if (!start || !touch || start.key !== normalizedKey) return;
      const deltaX = Math.abs(touch.clientX - start.x);
      const deltaY = Math.abs(touch.clientY - start.y);
      if (Math.max(deltaX, deltaY) > 28) return;
      event.preventDefault();
      runRailAction(normalizedKey, action);
    },
    [runRailAction]
  );

  const openStoryFromRail = useCallback(
    (story: any) => {
      const storyId = String(story?.id || '').trim();
      runRailAction(`story:${storyId || 'unknown'}`, () => {
        setActiveStory(story);
        if (storyId) {
          CommunityService.viewStory(storyId).catch(() => {});
        }
      });
    },
    [runRailAction]
  );

  const openScrollFromRail = useCallback(
    (scrollId: string) => {
      const normalizedId = String(scrollId || '').trim();
      if (!normalizedId) return;
      runRailAction(`scroll:${normalizedId}`, () => {
        navigate(`/scroll?scroll=${encodeURIComponent(normalizedId)}`);
      });
    },
    [navigate, runRailAction]
  );

  useEffect(() => {
    if (storyRailTab === 'scroll') setScrollRailPrimed(true);
    if (storyRailTab === 'live') setLiveRailPrimed(true);
  }, [storyRailTab]);

  useEffect(() => {
    if (!enabled || lightweightRailMode) return;
    const scrollTimer = window.setTimeout(() => setScrollRailPrimed(true), 1800);
    const liveTimer = window.setTimeout(() => setLiveRailPrimed(true), 3200);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(liveTimer);
    };
  }, [enabled, lightweightRailMode]);

  const resetDraft = () => {
    setComposerMode('create');
    setEditingStory(null);
    setDraftType(null);
    setDraftVisibility('public');
    setDraftContent('');
    setDraftMediaFile(null);
    setDraftTextStyle(getDefaultStoryTextDraft());
    setComposerStep('choose');
  };

  const openCreate = () => {
    if (!user?.id) {
      navigate('/auth/login');
      return;
    }
    resetDraft();
    setComposerOpen(true);
  };

  const openEdit = (story: any) => {
    if (!story?.id || !canManageStory(story, user)) return;
    setComposerMode('edit');
    setEditingStory(story);
    const type = resolveStoryType(story);
    setDraftType(type);
    setDraftVisibility(normalizeVisibility(story?.visibility));
    setDraftContent(resolveStoryContent(story));
    if (type === 'text') {
      const style = getStoryTextStyle(story);
      setDraftTextStyle({
        textBackground: style.background,
        textColor: style.color,
        textFont: style.fontFamily,
        textAlign: (style.textAlign as any) || 'center'
      });
      setDraftMediaFile(null);
    } else {
      const media = story?.media || story?.mediaFile || story?.file || null;
      if (media?.id) {
        setDraftMediaFile({
          id: String(media.id),
          user_id: resolveStoryOwnerId(story) || String(user?.id || ''),
          name: String(media?.name || media?.originalName || media?.original_name || 'Story media'),
          type,
          size: Number(media?.size || 0) || 0,
          url: String(media?.url || media?.downloadUrl || media?.download_url || ''),
          category: (media?.category || 'other') as any,
          created_at: String(media?.created_at || media?.createdAt || story?.createdAt || new Date().toISOString()),
          mime_type: String(media?.mimeType || media?.mime_type || ''),
          mimeType: String(media?.mimeType || media?.mime_type || '')
        });
      } else {
        setDraftMediaFile(null);
      }
    }
    setComposerStep('compose');
    setComposerOpen(true);
  };

  const buildStoryUrl = (storyId: string) => {
    return buildPublicAppUrl(`/community/stories/${encodeURIComponent(storyId)}`);
  };

  const patchStoryInState = (storyId: string, patch: Record<string, any>) => {
    if (!storyId) return;
    setStories((prev) =>
      prev.map((entry) => {
        if (String(entry?.id) !== String(storyId)) return entry;
        return { ...entry, ...patch };
      })
    );
    setActiveStory((current) => (String(current?.id) === String(storyId) ? { ...current, ...patch } : current));
  };

  const engageStoryAndSync = async (story: any, type: 'comment' | 'repost' | 'dash' | 'send') => {
    const storyId = String(story?.id || '').trim();
    if (!storyId) return;
    setStoryActionBusy((prev) => ({ ...prev, [storyId]: true }));
    try {
      const response = await CommunityService.engageStory(storyId, type);
      const nextStory = response?.story || response?.data?.story || null;
      const interactions = response?.interactions || response?.data?.interactions || null;
      if (nextStory && typeof nextStory === 'object') {
        patchStoryInState(storyId, nextStory);
      } else if (interactions && typeof interactions === 'object') {
        patchStoryInState(storyId, {
          commentsCount: interactions.comments,
          repostsCount: interactions.reposts,
          dashesCount: interactions.dashes,
          sendsCount: interactions.sends,
          interactions: {
            comments: interactions.comments,
            reposts: interactions.reposts,
            dashes: interactions.dashes,
            sends: interactions.sends
          }
        });
      } else {
        const increments: Record<string, number> = {};
        if (type === 'comment') increments.commentsCount = Number(story?.commentsCount || story?.interactions?.comments || 0) + 1;
        if (type === 'repost') increments.repostsCount = Number(story?.repostsCount || story?.interactions?.reposts || 0) + 1;
        if (type === 'dash') increments.dashesCount = Number(story?.dashesCount || story?.interactions?.dashes || 0) + 1;
        if (type === 'send') increments.sendsCount = Number(story?.sendsCount || story?.interactions?.sends || 0) + 1;
        patchStoryInState(storyId, increments);
      }
      window.dispatchEvent(
        new CustomEvent('community:story_engaged', {
          detail: { storyId, type }
        })
      );
    } finally {
      setStoryActionBusy((prev) => {
        const next = { ...prev };
        delete next[storyId];
        return next;
      });
    }
  };

  const likeStoryAndSync = async (story: any) => {
    const storyId = String(story?.id || '').trim();
    if (!storyId) return;
    if (!user?.id) {
      navigate('/auth/login');
      return;
    }
    if (storyActionBusy[storyId]) return;
    setStoryActionBusy((prev) => ({ ...prev, [storyId]: true }));
    try {
      const response = await CommunityService.toggleStoryLike(storyId);
      const payload = response?.data ?? response ?? {};
      const liked = payload?.liked ?? payload?.viewerLiked ?? !Boolean(story?.viewerLiked);
      const likesCount =
        payload?.likesCount ??
        payload?.likes ??
        Math.max(0, Number(story?.likesCount ?? story?._count?.likes ?? 0) + (liked ? 1 : -1));
      patchStoryInState(storyId, {
        likesCount,
        viewerLiked: liked,
        _count: { ...(story?._count || {}), likes: likesCount }
      });
    } catch (error) {
      console.error('Failed to like story', error);
    } finally {
      setStoryActionBusy((prev) => {
        const next = { ...prev };
        delete next[storyId];
        return next;
      });
    }
  };

  const handleStoryCommentAction = (story: any) => {
    if (!story?.id) return;
    setStoryActionTarget(story);
    setStoryCommentDraft('');
    setStoryCommentOpen(true);
  };

  const handleStoryRepostAction = (story: any) => {
    if (!story?.id) return;
    setStoryActionTarget(story);
    setStoryRepostOpen(true);
  };

  const handleStorySendAction = (story: any) => {
    if (!story?.id) return;
    setStoryActionTarget(story);
    setStorySendOpen(true);
  };

  const handleStoryDashAction = (story: any) => {
    if (!story?.id) return;
    setStoryActionTarget(story);
    setStoryDashOpen(true);
  };

  const submitStoryComment = async () => {
    const story = storyActionTarget;
    const storyId = String(story?.id || '').trim();
    if (!storyId) return;
    const content = String(storyCommentDraft || '').trim();
    if (!content) {
      showNotification('warning', 'Stories', 'Comment cannot be empty.');
      return;
    }
    try {
      await CommunityService.createPost({
        content: `${content}\n\nCommented on story by ${resolveStoryAuthorName(story, 'Community member')}.\n${buildStoryUrl(storyId)}`
      });
      await engageStoryAndSync(story, 'comment');
      setStoryCommentOpen(false);
      setStoryCommentDraft('');
      showNotification('success', 'Stories', 'Comment shared to your feed.');
    } catch (e: any) {
      showNotification('error', 'Stories', e?.response?.data?.error || e?.message || 'Unable to comment on story.');
    }
  };

  const repostStory = async (comment?: string) => {
    const story = storyActionTarget;
    const storyId = String(story?.id || '').trim();
    if (!storyId) return;
    const link = buildStoryUrl(storyId);
    const authorName = resolveStoryAuthorName(story, 'Community member');
    const storyText = resolveStoryContent(story);
    const wrapperComment = String(comment || '').trim();
    try {
      await CommunityService.createPost({
        content: wrapperComment ? `${wrapperComment}\n\n${link}` : `${storyText || `Reposted a story by ${authorName}.`}\n\n${link}`
      });
      await engageStoryAndSync(story, 'repost');
      setStoryRepostOpen(false);
      showNotification('success', 'Stories', 'Story reposted.');
    } catch (e: any) {
      showNotification('error', 'Stories', e?.response?.data?.error || e?.message || 'Unable to repost story.');
    }
  };

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let mounted = true;
    let hasCachedStories = false;
    try {
      const raw = localStorage.getItem(storiesCacheKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { ts?: number; items?: any[] };
        const cachedStories = Array.isArray(parsed?.items) ? parsed.items.filter(isStoryActive).slice(0, maxItems) : [];
        if (cachedStories.length) {
          hasCachedStories = true;
          setStories(cachedStories);
          setError(null);
        }
      }
    } catch {
      // Ignore cache parse errors.
    }
    setLoading(!hasCachedStories);
    setError(null);
    withFastFail(CommunityService.getStoriesFeed(), 25000, 'Stories request timed out. Tap retry.')
      .then((items) => {
        if (!mounted) return;
        const nextStories = Array.isArray(items) ? items.filter(isStoryActive).slice(0, maxItems) : [];
        setStories(nextStories);
        setError(null);
        try {
          localStorage.setItem(
            storiesCacheKey,
            JSON.stringify({
              ts: Date.now(),
              items: nextStories
            })
          );
        } catch {
          // Ignore cache write errors.
        }
      })
      .catch((e: any) => {
        if (!mounted) return;
        if (hasCachedStories) {
          setError('Showing saved stories while we reconnect.');
        } else {
          setError(e?.response?.data?.error || e?.message || 'Failed to load stories');
          setStories([]);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [enabled, maxItems, storiesCacheKey, storiesReloadTick]);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    let hasCachedScrolls = false;
    try {
      const raw = localStorage.getItem(scrollCacheKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { ts?: number; items?: ScrollVideo[]; config?: ScrollConfig | null };
        const cachedScrolls = Array.isArray(parsed?.items) ? parsed.items.slice(0, maxScrollItems) : [];
        if (cachedScrolls.length) {
          hasCachedScrolls = true;
          setScrolls(cachedScrolls);
          setScrollConfig(parsed?.config || null);
          setScrollError(null);
        }
      }
    } catch {
      // Ignore cache parse errors.
    }
    setScrollsLoading(!hasCachedScrolls);
    setScrollError(null);
    withFastFail(ScrollService.getFeed({ limit: maxScrollItems }), 25000, 'Scroll request timed out. Tap retry.')
      .then((feed) => {
        if (!mounted) return;
        const items = Array.isArray(feed?.items)
          ? feed.items.filter((item) => String(item?.status || '').toUpperCase() !== 'REMOVED').slice(0, maxScrollItems)
          : [];
        setScrolls(items);
        setScrollConfig(feed?.config || null);
        setScrollError(null);
        try {
          localStorage.setItem(
            scrollCacheKey,
            JSON.stringify({
              ts: Date.now(),
              items,
              config: feed?.config || null
            })
          );
        } catch {
          // Ignore cache write errors.
        }
      })
      .catch((e: any) => {
        if (!mounted) return;
        if (hasCachedScrolls) {
          setScrollError('Showing saved Scroll videos while we reconnect.');
        } else {
          setScrollError(e?.response?.data?.error || e?.message || 'Failed to load Scroll videos');
          setScrolls([]);
          setScrollConfig(null);
        }
      })
      .finally(() => {
        if (mounted) setScrollsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [enabled, maxScrollItems, scrollCacheKey, scrollRailPrimed, scrollReloadTick]);

  useEffect(() => {
    if (!enabled || !liveFeatureStatus.enabled || !liveRailPrimed) {
      setLiveSessions([]);
      setLiveError(null);
      setLiveLoading(false);
      return;
    }
    let mounted = true;
    let hasCachedLive = false;
    try {
      const raw = localStorage.getItem(liveCacheKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { ts?: number; items?: LiveSession[] };
        const ts = Number(parsed?.ts || 0);
        const age = Date.now() - ts;
        const cachedSessions = Array.isArray(parsed?.items) ? parsed.items : [];
        if (cachedSessions.length && age <= LIVE_CACHE_TTL_MS) {
          hasCachedLive = true;
          setLiveSessions(cachedSessions);
          setLiveError(null);
        }
      }
    } catch {
      // Ignore cache parse errors.
    }
    setLiveLoading(!hasCachedLive);
    setLiveError(null);
    withFastFail(LiveService.getActiveSessions(20), 16000, 'Live streams request timed out. Tap retry.')
      .then((result) => {
        if (!mounted) return;
        const next = Array.isArray(result?.items) ? result.items : [];
        setLiveSessions(next);
        setLiveError(null);
        try {
          localStorage.setItem(
            liveCacheKey,
            JSON.stringify({
              ts: Date.now(),
              items: next
            })
          );
        } catch {
          // Ignore cache write errors.
        }
      })
      .catch((error: any) => {
        if (!mounted) return;
        if (hasCachedLive) {
          setLiveError('Showing saved live sessions while we reconnect.');
        } else {
          setLiveError(error?.response?.data?.error || error?.message || 'Failed to load active live streams');
          setLiveSessions([]);
        }
      })
      .finally(() => {
        if (mounted) setLiveLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [enabled, liveCacheKey, liveFeatureStatus.enabled, liveRailPrimed, liveReloadTick]);

  useEffect(() => {
    if (liveFeatureStatus.enabled || storyRailTab !== 'live') return;
    setStoryRailTab('stories');
  }, [liveFeatureStatus.enabled, storyRailTab]);

  // Realtime: socket layer forwards socket events as window CustomEvents.
  useEffect(() => {
    if (!enabled) return;
    const onCreated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const story = detail?.story || detail;
      if (!story?.id) return;
      setStories((prev) => updateStoryList(prev, story, maxItems));
    };
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const story = detail?.story || detail;
      if (!story?.id) return;
      setStories((prev) => updateStoryList(prev, story, maxItems));
      setActiveStory((current) => (current?.id === story.id ? { ...current, ...story } : current));
    };
    const onDeleted = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const storyId = String(detail?.storyId || detail?.id || '').trim();
      if (!storyId) return;
      setStories((prev) => removeStoryFromList(prev, storyId));
      setActiveStory((current) => (String(current?.id) === storyId ? null : current));
    };
    const onEngaged = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const storyId = String(detail?.storyId || detail?.id || '').trim();
      const story = detail?.story || null;
      if (!storyId && !story?.id) return;
      const normalizedId = storyId || String(story.id);
      if (story && typeof story === 'object') {
        patchStoryInState(normalizedId, story);
      }
    };
    window.addEventListener('community:story_created', onCreated as EventListener);
    window.addEventListener('community:story_updated', onUpdated as EventListener);
    window.addEventListener('community:story_deleted', onDeleted as EventListener);
    window.addEventListener('community:story_engaged', onEngaged as EventListener);
    return () => {
      window.removeEventListener('community:story_created', onCreated as EventListener);
      window.removeEventListener('community:story_updated', onUpdated as EventListener);
      window.removeEventListener('community:story_deleted', onDeleted as EventListener);
      window.removeEventListener('community:story_engaged', onEngaged as EventListener);
    };
  }, [enabled, maxItems]);

  useEffect(() => {
    if (!enabled) return;
    const onScrollNew = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const created = detail?.scroll || detail;
      if (!created?.id) return;
      setScrolls((prev) => [created, ...prev.filter((item) => item.id !== created.id)].slice(0, maxScrollItems));
    };
    const onScrollRemoved = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const removedId = String(detail?.scrollId || detail?.id || '').trim();
      if (!removedId) return;
      setScrolls((prev) => prev.filter((item) => item.id !== removedId));
    };
    window.addEventListener('scroll:new', onScrollNew as EventListener);
    window.addEventListener('scroll:removed', onScrollRemoved as EventListener);
    return () => {
      window.removeEventListener('scroll:new', onScrollNew as EventListener);
      window.removeEventListener('scroll:removed', onScrollRemoved as EventListener);
    };
  }, [enabled, maxScrollItems]);

  useEffect(() => {
    if (!enabled) return;
    const onLiveChanged = () => {
      setLiveReloadTick((prev) => prev + 1);
    };
    window.addEventListener('live:started', onLiveChanged as EventListener);
    window.addEventListener('live:ended', onLiveChanged as EventListener);
    window.addEventListener('live:viewer_count_updated', onLiveChanged as EventListener);
    return () => {
      window.removeEventListener('live:started', onLiveChanged as EventListener);
      window.removeEventListener('live:ended', onLiveChanged as EventListener);
      window.removeEventListener('live:viewer_count_updated', onLiveChanged as EventListener);
    };
  }, [enabled]);

  const canPublish = (() => {
    if (draftType === 'text') return draftContent.trim().length > 0;
    if (draftType === 'image' || draftType === 'video') return Boolean(draftMediaFile?.id) && !mediaUploadBusy;
    return false;
  })();

  const uploadStoryMediaFromDevice = async (file: File | null) => {
    if (!file) return;
    if (!user?.id) {
      navigate('/auth/login');
      return;
    }
    const mime = String(file.type || '').toLowerCase();
    const type = mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : null;
    if (!type) {
      showNotification('error', 'Story', 'Please select an image or video.');
      return;
    }
    setMediaUploadBusy(true);
    setMediaUploadLabel(`Uploading ${file.name}`);
    try {
      const uploaded = await FileService.uploadFile(file, 'community' as any, {
        role: user.role,
        visibility: draftVisibility === 'private' ? 'private' : 'public',
        userId: user.id
      });
      setDraftType(type);
      setDraftMediaFile(uploaded);
      setComposerStep('compose');
      setComposerOpen(true);
    } catch (error: any) {
      showNotification('error', 'Story', error?.response?.data?.error || error?.message || 'Unable to upload story media.');
    } finally {
      setMediaUploadBusy(false);
      setMediaUploadLabel('');
    }
  };

  const handleStoryMediaInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.currentTarget.value = '';
    void uploadStoryMediaFromDevice(file);
  };

  const publish = async () => {
    if (!draftType || !canPublish || publishing) return;
    if (!user?.id) return;

    setPublishing(true);
    try {
      if (composerMode === 'edit' && editingStory?.id) {
        const payload: any = { visibility: draftVisibility };
        if (draftType === 'text') {
          payload.content = draftContent.trim();
          payload.textBackground = draftTextStyle.textBackground;
          payload.textColor = draftTextStyle.textColor;
          payload.textFont = draftTextStyle.textFont;
          payload.textAlign = draftTextStyle.textAlign;
        } else {
          payload.caption = draftContent.trim() || undefined;
          const currentMediaId = String(editingStory?.mediaFileId || editingStory?.media_file_id || editingStory?.media?.id || '');
          const nextMediaId = String(draftMediaFile?.id || '');
          if (nextMediaId && nextMediaId !== currentMediaId) payload.mediaFileId = nextMediaId;
        }
        const updated = await CommunityService.updateStory(editingStory.id, payload);
        window.dispatchEvent(new CustomEvent('community:story_updated', { detail: { story: updated } }));
        showNotification('success', 'Story', 'Story updated.');
        setComposerOpen(false);
        resetDraft();
        setActiveStory((current) => (current?.id === updated?.id ? { ...current, ...updated } : current));
        return;
      }

      if (draftType === 'text') {
        const created = await CommunityService.createStory({
          type: 'text',
          content: draftContent.trim(),
          visibility: draftVisibility,
          textBackground: draftTextStyle.textBackground,
          textColor: draftTextStyle.textColor,
          textFont: draftTextStyle.textFont,
          textAlign: draftTextStyle.textAlign
        });
        window.dispatchEvent(new CustomEvent('community:story_created', { detail: { story: created } }));
        setStories((prev) => updateStoryList(prev, created, maxItems));
        setActiveStory(created);
        showNotification('success', 'Story', 'Your story is live.');
      } else {
        if (!draftMediaFile?.id) throw new Error('Select a media file first.');
        const created = await CommunityService.createStory({
          type: draftType,
          mediaFileId: draftMediaFile.id,
          caption: draftContent.trim() || undefined,
          visibility: draftVisibility
        });
        window.dispatchEvent(new CustomEvent('community:story_created', { detail: { story: created } }));
        setStories((prev) => updateStoryList(prev, created, maxItems));
        setActiveStory(created);
        showNotification('success', 'Story', 'Your story is live.');
      }

      setComposerOpen(false);
      resetDraft();
    } catch (e: any) {
      showNotification('error', 'Story failed', e?.response?.data?.error || e?.message || 'Unable to publish story.');
    } finally {
      setPublishing(false);
    }
  };

  const deleteStory = async (story: any) => {
    if (!story?.id || !canManageStory(story, user)) return;
    if (!confirm('Delete this story?')) return;
    try {
      await CommunityService.deleteStory(String(story.id));
      window.dispatchEvent(new CustomEvent('community:story_deleted', { detail: { storyId: story.id } }));
      setStories((prev) => removeStoryFromList(prev, String(story.id)));
      setActiveStory((current) => (String(current?.id) === String(story.id) ? null : current));
      showNotification('success', 'Story', 'Story deleted.');
    } catch (e: any) {
      showNotification('error', 'Story', e?.response?.data?.error || e?.message || 'Unable to delete story.');
    }
  };

  if (!enabled) return null;

  return (
    <>
      <div className="mx-auto max-w-md px-3 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setStoryRailTab('stories')}
              className={[
                'rounded-full px-3 py-1 text-xs font-semibold transition',
                storyRailTab === 'stories' ? 'bg-slate-900 text-white' : 'text-slate-600'
              ].join(' ')}
            >
              Stories
            </button>
            <button
              type="button"
              onClick={() => setStoryRailTab('scroll')}
              className={[
                'rounded-full px-3 py-1 text-xs font-semibold transition',
                storyRailTab === 'scroll' ? 'bg-slate-900 text-white' : 'text-slate-600'
              ].join(' ')}
            >
              Scroll
            </button>
            {liveFeatureStatus.enabled ? (
              <button
                type="button"
                onClick={() => setStoryRailTab('live')}
                className={[
                  'rounded-full px-3 py-1 text-xs font-semibold transition',
                  storyRailTab === 'live' ? 'bg-slate-900 text-white' : 'text-slate-600'
                ].join(' ')}
              >
                Live
              </button>
            ) : null}
          </div>
          {liveFeatureStatus.enabled ? (
            <button
              type="button"
              onClick={() => navigate('/live/studio')}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-700"
            >
              Go Live
            </button>
          ) : null}
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {storyRailTab === 'stories' ? (
            <>
              <button
                type="button"
                onClick={openCreate}
                className="relative h-[154px] w-[92px] shrink-0 overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white"
                aria-label="Create story"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 via-indigo-500/10 to-cyan-500/15" />
                <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 text-slate-700">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white">
                    <Plus className="h-5 w-5 text-slate-600" />
                  </div>
                  <div className="px-2 text-center text-[12px] font-semibold">Your story</div>
                </div>
              </button>

              {loading && visibleStories.length === 0 ? (
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : visibleStories.length === 0 ? (
                <div className="rounded-2xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700">
                  {error || 'No stories yet.'}
                  <button
                    type="button"
                    onClick={() => setStoriesReloadTick((prev) => prev + 1)}
                    className="ml-2 rounded-lg bg-red-600 px-2 py-1 text-[10px] font-semibold text-white"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                visibleStories.map((story) => {
                  const id = String(story?.id || '').trim();
                  const name = resolveStoryAuthorName(story, 'Story');
                  const storyType = resolveStoryType(story);
                  const storyText = resolveStoryContent(story);
                  const avatar = resolveStoryAuthorAvatar(story);
                  const media = resolveStoryMediaUrl(story);
                  const imagePreviewFailed = Boolean(storyPreviewMediaErrors[id]);
                  const fallbackLetter = resolveStoryAuthorInitial(story);
                  return (
                    <button
                      key={id}
                      type="button"
                      onTouchStart={(event) => beginRailTouch(`story:${id}`, event)}
                      onTouchEnd={(event) =>
                        commitRailTouch(`story:${id}`, event, () => {
                          openStoryFromRail(story);
                        })
                      }
                      onTouchCancel={cancelRailGesture}
                      onPointerDown={(event) => beginRailGesture(`story:${id}`, event)}
                      onPointerUp={(event) =>
                        commitRailGesture(`story:${id}`, event, () => {
                          openStoryFromRail(story);
                        })
                      }
                      onPointerCancel={cancelRailGesture}
                      onClick={() => openStoryFromRail(story)}
                      className="relative h-[154px] w-[92px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900"
                      style={{ touchAction: 'manipulation' }}
                      aria-label={`Open story by ${name}`}
                    >
                      {storyType === 'text' && storyText ? (
                        (() => {
                          const style = getStoryTextStyle(story);
                          return (
                            <div
                              className="flex h-full w-full items-center justify-center px-2.5 text-center text-[11px] font-semibold"
                              style={{
                                background: style.background,
                                color: style.color,
                                fontFamily: style.fontFamily,
                                textAlign: style.textAlign as any
                              }}
                            >
                              <StaticPreviewText
                                text={storyText}
                                className="line-clamp-5"
                                textClassName="whitespace-pre-wrap break-words"
                                moreClassName="opacity-90"
                              />
                            </div>
                          );
                        })()
                      ) : media.url && !(imagePreviewFailed && !media.isVideo) ? (
                        media.isVideo ? (
                          <InlineAutoplayVideo
                            src={media.url}
                            poster={media.thumbnailUrl}
                            className="pointer-events-none h-full w-full object-cover"
                            containerClassName="pointer-events-none h-full w-full"
                            controls={false}
                            loop
                            preload="metadata"
                            autoplayEnabled={previewAutoplayEnabled}
                            showMuteToggle={false}
                          />
                        ) : (
                          <img
                            src={media.url}
                            alt=""
                            className="pointer-events-none h-full w-full object-cover"
                            onError={() =>
                              setStoryPreviewMediaErrors((prev) =>
                                prev[id] ? prev : { ...prev, [id]: true }
                              )
                            }
                          />
                        )
                      ) : avatar ? (
                        <img src={avatar} alt={name} className="pointer-events-none h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white">
                          {fallbackLetter}
                        </div>
                      )}
                      <div className="pointer-events-none absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-blue-300/90 bg-slate-700 text-[11px] font-semibold text-white shadow">
                        {avatar ? (
                          <img src={avatar} alt={name} className="h-full w-full object-cover" />
                        ) : (
                          <span>{fallbackLetter}</span>
                        )}
                      </div>
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left">
                        <p className="line-clamp-1 text-[10px] font-semibold text-white">{name}</p>
                        {storyType !== 'text' ? (
                          <p className="line-clamp-1 text-[10px] text-white/80">
                            {storyText || (media.isVideo ? 'Video story' : 'Photo story')}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
              {error && visibleStories.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setStoriesReloadTick((prev) => prev + 1)}
                  className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800"
                >
                  Showing saved stories. Retry
                </button>
              ) : null}
            </>
          ) : storyRailTab === 'scroll' ? (
            <>
              <button
                type="button"
                onClick={() => setScrollCreateOpen(true)}
                className="relative h-[154px] w-[92px] shrink-0 overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white"
                aria-label="Create Scroll"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-fuchsia-500/15 via-indigo-500/10 to-cyan-500/15" />
                <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 text-slate-700">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div className="px-2 text-center text-[12px] font-semibold">Create Scroll</div>
                </div>
              </button>

              {scrollsLoading && scrolls.length === 0 ? (
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading Scroll...
                </div>
              ) : scrolls.length === 0 ? (
                <div className="rounded-2xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700">
                  {scrollError || 'No Scroll videos yet.'}
                  <button
                    type="button"
                    onClick={() => setScrollReloadTick((prev) => prev + 1)}
                    className="ml-2 rounded-lg bg-red-600 px-2 py-1 text-[10px] font-semibold text-white"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                scrolls.map((scroll) => {
                  const id = String(scroll?.id || '').trim();
                  const media = resolveScrollMedia(scroll);
                  const authorName = resolveScrollAuthorName(scroll, 'Scrolith');
                  const authorAvatar = resolveScrollAuthorAvatar(scroll);
                  const authorInitial = resolveScrollAuthorInitial(scroll);
                  return (
                    <button
                      key={id}
                      type="button"
                      onTouchStart={(event) => beginRailTouch(`scroll:${id}`, event)}
                      onTouchEnd={(event) =>
                        commitRailTouch(`scroll:${id}`, event, () => {
                          openScrollFromRail(id);
                        })
                      }
                      onTouchCancel={cancelRailGesture}
                      onPointerDown={(event) => beginRailGesture(`scroll:${id}`, event)}
                      onPointerUp={(event) =>
                        commitRailGesture(`scroll:${id}`, event, () => {
                          openScrollFromRail(id);
                        })
                      }
                      onPointerCancel={cancelRailGesture}
                      onClick={() => openScrollFromRail(id)}
                      className="relative h-[154px] w-[92px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900"
                      style={{ touchAction: 'manipulation' }}
                      aria-label={`Open Scroll by ${authorName}`}
                    >
                      {media.url ? (
                        <InlineAutoplayVideo
                          src={media.url}
                          poster={media.poster}
                          className="pointer-events-none h-full w-full object-cover"
                          containerClassName="pointer-events-none h-full w-full"
                          controls={false}
                          loop
                          preload="metadata"
                          autoplayEnabled={previewAutoplayEnabled}
                          showMuteToggle={false}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-white/80">Scroll</div>
                      )}
                      <div className="pointer-events-none absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-blue-300/90 bg-slate-700 text-[11px] font-semibold text-white shadow">
                        {authorAvatar ? (
                          <img src={authorAvatar} alt={authorName} className="h-full w-full object-cover" />
                        ) : (
                          <span>{authorInitial}</span>
                        )}
                      </div>
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left">
                        <p className="line-clamp-1 text-[10px] font-semibold text-white">{authorName}</p>
                        <p className="line-clamp-1 text-[10px] text-white/80">{scroll.title || scroll.description || 'Scroll'}</p>
                      </div>
                    </button>
                  );
                })
              )}
              {scrollError && scrolls.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setScrollReloadTick((prev) => prev + 1)}
                  className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800"
                >
                  Showing saved Scrolls. Retry
                </button>
              ) : null}
            </>
          ) : (
            <>
              {liveFeatureStatus.enabled ? (
                <button
                  type="button"
                  onClick={() => navigate('/live/studio')}
                  className="relative h-[154px] w-[92px] shrink-0 overflow-hidden rounded-2xl border border-dashed border-rose-300 bg-white"
                  aria-label="Create Live Stream"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-rose-500/20 via-fuchsia-500/10 to-indigo-500/15" />
                  <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 text-slate-700">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-rose-300 bg-white">
                      <Radio className="h-5 w-5 text-rose-600" />
                    </div>
                    <div className="px-2 text-center text-[12px] font-semibold">Go Live</div>
                  </div>
                </button>
              ) : null}

              {liveLoading && liveSessions.length === 0 ? (
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading Live...
                </div>
              ) : liveSessions.length === 0 ? (
                <div className="rounded-2xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700">
                  {liveError || 'No active livestreams right now.'}
                  <button
                    type="button"
                    onClick={() => setLiveReloadTick((prev) => prev + 1)}
                    className="ml-2 rounded-lg bg-red-600 px-2 py-1 text-[10px] font-semibold text-white"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                liveSessions.map((live) => (
                  <button
                    key={live.id}
                    type="button"
                    onClick={() => navigate(`/live/${encodeURIComponent(live.id)}`)}
                    className="relative h-[154px] w-[116px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900"
                    aria-label={`Open live stream ${live.title || 'stream'}`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80" />
                    <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-rose-600/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                      <Radio className="h-3 w-3" />
                      LIVE
                    </div>
                    <div className="absolute right-2 top-2 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {Number(live.viewerCount || 0)}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-2 text-left">
                      <p className="line-clamp-1 text-[11px] font-semibold text-white">{live.title || 'Live session'}</p>
                      <p className="line-clamp-1 text-[10px] text-white/80">{live.host?.name || 'Scrolith host'}</p>
                    </div>
                  </button>
                ))
              )}
              {liveError && liveSessions.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setLiveReloadTick((prev) => prev + 1)}
                  className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800"
                >
                  Showing saved Live. Retry
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {activeStory ? (
        <StoryViewer
          story={activeStory}
          stories={visibleStories}
          viewer={user}
          onClose={() => setActiveStory(null)}
          onNavigate={(story) => {
            if (!story?.id) return;
            setActiveStory(story);
            CommunityService.viewStory(String(story.id)).catch(() => {});
          }}
          onEdit={() => openEdit(activeStory)}
          onDelete={() => void deleteStory(activeStory)}
          onComment={() => handleStoryCommentAction(activeStory)}
          onRepost={() => handleStoryRepostAction(activeStory)}
          onDash={() => handleStoryDashAction(activeStory)}
          onSend={() => handleStorySendAction(activeStory)}
          onLike={() => void likeStoryAndSync(activeStory)}
          storyBusy={Boolean(storyActionBusy[String(activeStory?.id || '')])}
          autoplayEnabled={profile.autoplayEnabled}
        />
      ) : null}

      <Sheet
        open={composerOpen}
        title={composerMode === 'edit' ? 'Edit story' : 'Create story'}
        onClose={() => {
          if (publishing) return;
          setComposerOpen(false);
          resetDraft();
        }}
      >
        {composerStep === 'choose' ? (
          <div className="space-y-2">
            <SheetItem
              icon={<Type className="h-4 w-4" />}
              label="Text story"
              onClick={() => {
                setDraftType('text');
                setDraftContent('');
                setDraftVisibility('public');
                setDraftTextStyle(getDefaultStoryTextDraft());
                setComposerStep('compose');
              }}
            />
            <SheetItem
              icon={<ImageIcon className="h-4 w-4" />}
              label="Photo or video story"
              onClick={() => storyDeviceInputRef.current?.click()}
            />
            <SheetItem
              icon={<Video className="h-4 w-4" />}
              label="Capture with camera"
              onClick={() => storyCameraInputRef.current?.click()}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              {composerMode !== 'edit' ? (
                <button
                  type="button"
                  onClick={() => {
                    if (publishing) return;
                    resetDraft();
                    setComposerOpen(true);
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                >
                  Back
                </button>
              ) : (
                <div className="text-xs font-semibold text-slate-500">Changes publish instantly.</div>
              )}

              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                <span className="text-slate-500">Visibility</span>
                <select
                  value={draftVisibility}
                  onChange={(e) => setDraftVisibility(normalizeVisibility(e.target.value))}
                  className="bg-transparent text-xs font-semibold text-slate-900 outline-none"
                  disabled={publishing}
                >
                  <option value="public">Public</option>
                  <option value="private">Only me</option>
                </select>
              </label>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
              {draftType === 'text' ? (
                <div
                  className="flex h-56 w-full items-center justify-center px-6 text-center text-base font-semibold"
                  style={{
                    background: draftTextStyle.textBackground,
                    color: draftTextStyle.textColor,
                    fontFamily: draftTextStyle.textFont,
                    textAlign: draftTextStyle.textAlign as any
                  }}
                >
                  <span className="whitespace-pre-wrap">
                    {draftContent.trim().length ? draftContent : 'Type your story...'}
                  </span>
                </div>
              ) : draftMediaFile?.url ? (
                draftType === 'video' ? (
                  <video src={draftMediaFile.url} className="h-56 w-full object-cover" controls preload="metadata" />
                ) : (
                  <img src={draftMediaFile.url} alt="Story" className="h-56 w-full object-cover" />
                )
              ) : (
                <div className="flex h-56 w-full items-center justify-center gap-2 text-sm text-slate-600">
                  <Video className="h-5 w-5" />
                  Select media to preview
                </div>
              )}
            </div>

            {draftType === 'text' ? (
              <div className="space-y-3">
                <textarea
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="Write a short story..."
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                  rows={4}
                  disabled={publishing}
                />

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-500">Theme</div>
                  <div className="flex flex-wrap gap-2">
                    {storyTextThemes.map((theme) => {
                      const selected = draftTextStyle.textBackground === theme.background;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() =>
                            setDraftTextStyle((prev) => ({
                              ...prev,
                              textBackground: theme.background,
                              textColor: theme.textColor
                            }))
                          }
                          className={[
                            'h-8 w-8 rounded-full border shadow-sm',
                            selected ? 'border-slate-900 ring-2 ring-slate-300' : 'border-white/70'
                          ].join(' ')}
                          style={{ background: theme.background }}
                          aria-label={theme.label}
                          disabled={publishing}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-500">Font</div>
                  <div className="flex flex-wrap gap-2">
                    {storyTextFonts.map((font) => {
                      const selected = draftTextStyle.textFont === font.fontFamily;
                      return (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => setDraftTextStyle((prev) => ({ ...prev, textFont: font.fontFamily }))}
                          className={[
                            'rounded-full border px-3 py-1 text-xs font-semibold',
                            selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'
                          ].join(' ')}
                          style={{ fontFamily: font.fontFamily }}
                          disabled={publishing}
                        >
                          {font.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-500">Align</div>
                  <div className="flex gap-2">
                    {([
                      { key: 'left', icon: <AlignLeft className="h-4 w-4" /> },
                      { key: 'center', icon: <AlignCenter className="h-4 w-4" /> },
                      { key: 'right', icon: <AlignRight className="h-4 w-4" /> }
                    ] as const).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setDraftTextStyle((prev) => ({ ...prev, textAlign: item.key }))}
                        className={[
                          'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold',
                          draftTextStyle.textAlign === item.key
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700'
                        ].join(' ')}
                        disabled={publishing}
                      >
                        {item.icon}
                        {item.key.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-500">Caption (optional)</div>
                    <button
                      type="button"
                      onClick={() => storyDeviceInputRef.current?.click()}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                      disabled={publishing || mediaUploadBusy}
                    >
                      Change media
                    </button>
                  </div>
                  {mediaUploadBusy ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{mediaUploadLabel || 'Uploading media...'}</span>
                    </div>
                  ) : null}
                  <textarea
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="Add a caption..."
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                  rows={3}
                  disabled={publishing}
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => void publish()}
              disabled={!canPublish || publishing}
              className="w-full rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {publishing ? 'Publishing...' : composerMode === 'edit' ? 'Save changes' : 'Publish story'}
            </button>
          </div>
        )}
      </Sheet>

      <ScrollCreateModal
        open={scrollCreateOpen}
        onClose={() => setScrollCreateOpen(false)}
        config={scrollConfig}
        onCreated={(created) => {
          setScrolls((prev) => [created, ...prev.filter((item) => item.id !== created.id)].slice(0, maxScrollItems));
          setStoryRailTab('scroll');
        }}
      />
      <input
        ref={storyDeviceInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleStoryMediaInputChange}
      />
      <input
        ref={storyCameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={handleStoryMediaInputChange}
      />

      {storyCommentOpen ? (
        <div className="fixed inset-0 z-[1100] flex items-end justify-center p-3">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              const storyId = String(storyActionTarget?.id || '');
              if (storyActionBusy[storyId]) return;
              setStoryCommentOpen(false);
            }}
          />
          <div className="relative w-full max-w-md rounded-3xl bg-white p-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-900">Comment on story</h3>
            <textarea
              value={storyCommentDraft}
              onChange={(event) => setStoryCommentDraft(event.target.value)}
              rows={4}
              placeholder="Write your comment..."
              className="mt-3 w-full resize-none rounded-2xl border border-slate-200 p-3 text-sm text-slate-700"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStoryCommentOpen(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitStoryComment()}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                disabled={storyActionBusy[String(storyActionTarget?.id || '')]}
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
        busy={storyActionBusy[String(storyActionTarget?.id || '')]}
        onRepostNow={async () => repostStory()}
        onRepostWithComment={async (comment) => repostStory(comment)}
      />

      <PostShareModal
        isOpen={storySendOpen}
        onClose={() => setStorySendOpen(false)}
        postUrl={storyActionTarget?.id ? buildStoryUrl(String(storyActionTarget.id)) : buildPublicAppUrl('/community')}
        entityLabel="story"
        shareText={
          storyActionTarget?.id
            ? `Check this story on Scrolith: ${buildStoryUrl(String(storyActionTarget.id))}`
            : 'Check this story on Scrolith'
        }
        onShareToNetwork={() => {
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
        prefillRecipientId={resolveStoryOwnerId(storyActionTarget)}
        titleOverride="Dash Story Creator"
        subtitleOverride="Support this story creator instantly with your Gcoin balance."
        onSuccess={async () => {
          if (!storyActionTarget?.id) return;
          await engageStoryAndSync(storyActionTarget, 'dash');
        }}
      />
    </>
  );
}

function StoryViewer({
  story,
  stories,
  viewer,
  onClose,
  onNavigate,
  onEdit,
  onDelete,
  onComment,
  onRepost,
  onDash,
  onSend,
  onLike,
  storyBusy,
  autoplayEnabled
}: {
  story: any;
  stories: any[];
  viewer: any;
  onClose: () => void;
  onNavigate: (nextStory: any) => void;
  onEdit: () => void;
  onDelete: () => void;
  onComment: () => void;
  onRepost: () => void;
  onDash: () => void;
  onSend: () => void;
  onLike: () => void;
  storyBusy: boolean;
  autoplayEnabled: boolean;
}) {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [touchOverlayMode, setTouchOverlayMode] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const overlayHideTimerRef = useRef<number | null>(null);
  const lastTapAtRef = useRef(0);

  const name = resolveStoryAuthorName(story, 'Story');
  const avatar = resolveStoryAuthorAvatar(story);
  const type = resolveStoryType(story);
  const media = resolveStoryMediaUrl(story);
  const content = resolveStoryContent(story);
  const canManage = canManageStory(story, viewer);
  const style = getStoryTextStyle(story);
  const ownerId = resolveStoryOwnerId(story);
  const initialIsFollowing =
    typeof story?.viewer?.isFollowingAuthor === 'boolean' ? Boolean(story.viewer.isFollowingAuthor) : undefined;
  const activeIndex = story?.id ? stories.findIndex((entry) => String(entry?.id) === String(story.id)) : -1;
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < stories.length - 1;
  const overlayShouldShow = !touchOverlayMode || overlayVisible;

  useEffect(() => {
    setImageLoadFailed(false);
  }, [story?.id, media.url]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(hover: none), (pointer: coarse)');
    const sync = () => setTouchOverlayMode(query.matches);
    sync();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', sync);
      return () => query.removeEventListener('change', sync);
    }
    query.addListener(sync);
    return () => query.removeListener(sync);
  }, []);

  useEffect(() => {
    setOverlayVisible(!touchOverlayMode);
  }, [story?.id, touchOverlayMode]);

  useEffect(() => {
    if (overlayHideTimerRef.current) {
      window.clearTimeout(overlayHideTimerRef.current);
      overlayHideTimerRef.current = null;
    }
    if (!story?.id || !touchOverlayMode || !overlayVisible) return;
    overlayHideTimerRef.current = window.setTimeout(() => {
      setOverlayVisible(false);
    }, STORY_CONTROL_HIDE_DELAY_MS);
    return () => {
      if (overlayHideTimerRef.current) {
        window.clearTimeout(overlayHideTimerRef.current);
        overlayHideTimerRef.current = null;
      }
    };
  }, [story?.id, overlayVisible, touchOverlayMode]);

  const revealOverlay = () => {
    if (!touchOverlayMode) return;
    setOverlayVisible(true);
  };

  const goToOffset = (offset: number) => {
    if (activeIndex < 0) return;
    const next = stories[activeIndex + offset];
    if (!next) return;
    onNavigate(next);
  };

  const handleDownload = async () => {
    if (!media.url) {
      showNotification('warning', 'Stories', 'No downloadable media is attached to this story.');
      return;
    }
    try {
      const result = await downloadToDevice({
        url: media.url,
        fileName: `${name.replace(/\s+/g, '-').toLowerCase() || 'story'}-${String(story?.id || Date.now())}`,
        mimeType: type === 'video' || media.isVideo ? 'video/mp4' : type === 'image' ? 'image/jpeg' : ''
      });
      showNotification(
        'success',
        'Stories',
        result.native ? `Saved to ${result.path || 'your device'}.` : 'Download started.'
      );
    } catch (error: any) {
      showNotification('error', 'Stories', error?.message || 'Unable to download story media.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[950] bg-black"
      onPointerDownCapture={(event) => {
        if (event.pointerType === 'touch') revealOverlay();
      }}
    >
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          overlayShouldShow ? 'max-h-40 opacity-100' : 'pointer-events-none max-h-0 opacity-0'
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-9 w-9 overflow-hidden rounded-full border border-white/20 bg-white/10">
              {avatar ? (
                <img src={avatar} alt={name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-semibold">
                  {(name[0] || 'S').toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {ownerId && String(ownerId) !== String(viewer?.id || '') ? (
                  <FollowButton
                    targetUserId={ownerId}
                    currentUserId={viewer?.id}
                    initialIsFollowing={initialIsFollowing}
                    onRequireLogin={() => navigate('/auth/login')}
                    className="h-7 border-white/30 bg-white/10 px-3 text-[11px] text-white hover:border-white/50 hover:bg-white/15"
                  />
                ) : null}
                <div className="truncate text-[11px] text-white/70">
                  {type === 'text' ? 'Text story' : type === 'video' ? 'Video story' : 'Photo story'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {media.url ? (
              <button
                type="button"
                onClick={() => void handleDownload()}
                className="rounded-full border border-white/20 bg-white/10 p-2"
                aria-label="Download story"
              >
                <Download className="h-5 w-5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setMuted((prev) => !prev)}
              className="rounded-full border border-white/20 bg-white/10 p-2"
              aria-label={muted ? 'Unmute story' : 'Mute story'}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            {canManage ? (
              <button
                type="button"
                onClick={() => setActionsOpen(true)}
                className="rounded-full border border-white/20 bg-white/10 p-2"
                aria-label="Story actions"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/20 bg-white/10 p-2"
              aria-label="Close story"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div
        className={`relative flex items-center justify-center px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] transition-[height] duration-300 ${
          overlayShouldShow ? 'h-[calc(100%-56px)]' : 'h-full'
        }`}
      >
        <div
          className="relative h-full w-full max-w-md overflow-hidden rounded-3xl bg-slate-900"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('button, a, input, textarea, select, label')) {
              touchStartRef.current = null;
              return;
            }
            revealOverlay();
            const touch = event.changedTouches?.[0];
            if (!touch) {
              touchStartRef.current = null;
              return;
            }
            touchStartRef.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('button, a, input, textarea, select, label')) return;
            const start = touchStartRef.current;
            const touch = event.changedTouches?.[0];
            touchStartRef.current = null;
            if (!start || !touch) return;
            const deltaX = touch.clientX - start.x;
            const deltaY = touch.clientY - start.y;
            if (Math.abs(deltaX) >= 20 && Math.abs(deltaX) > Math.abs(deltaY) + 6) {
              if (deltaX > 0) goToOffset(-1);
              if (deltaX < 0) goToOffset(1);
              return;
            }
            if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 18) return;
            const now = Date.now();
            if (lastTapAtRef.current && now - lastTapAtRef.current <= 320) {
              event.preventDefault();
              event.stopPropagation();
              lastTapAtRef.current = 0;
              onLike();
              return;
            }
            lastTapAtRef.current = now;
          }}
          onDoubleClick={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('button, a, input, textarea, select, label')) return;
            event.preventDefault();
            event.stopPropagation();
            onLike();
          }}
          onPointerDown={(event) => {
            if (event.pointerType !== 'touch') return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('button, a, input, textarea, select, label')) {
              touchStartRef.current = null;
              return;
            }
            revealOverlay();
            touchStartRef.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={(event) => {
            if (event.pointerType !== 'touch') return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('button, a, input, textarea, select, label')) return;
            const start = touchStartRef.current;
            touchStartRef.current = null;
            if (!start) return;
            const deltaX = event.clientX - start.x;
            const deltaY = event.clientY - start.y;
            if (Math.abs(deltaX) >= 20 && Math.abs(deltaX) > Math.abs(deltaY) + 6) {
              if (deltaX > 0) goToOffset(-1);
              if (deltaX < 0) goToOffset(1);
            }
          }}
        >
          {type === 'text' ? (
            <div
              className="flex h-full w-full items-center justify-center px-6 text-center text-base font-semibold"
              style={{
                background: style.background,
                color: style.color,
                fontFamily: style.fontFamily,
                textAlign: style.textAlign as any
              }}
            >
              <ExpandablePreviewText
                text={content || 'Story'}
                className="max-w-full"
                textClassName="text-base font-semibold"
                buttonClassName="text-white"
              />
            </div>
          ) : media.url && !(imageLoadFailed && !(type === 'video' || media.isVideo)) ? (
            type === 'video' || media.isVideo ? (
              <InlineAutoplayVideo
                key={String(story?.id || media.url || '')}
                src={media.url}
                poster={media.thumbnailUrl}
                className="h-full w-full object-cover"
                containerClassName="h-full w-full"
                controls={false}
                loop
                preload="metadata"
                autoplayEnabled={autoplayEnabled}
                muted={muted}
                onMutedChange={setMuted}
                showMuteToggle={false}
              />
            ) : (
              <img
                src={media.url}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setImageLoadFailed(true)}
              />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-white/80">Story media not available.</div>
          )}
          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/10 to-black/45" />

          <div
            className={`pointer-events-none absolute inset-y-0 left-0 right-0 z-30 flex items-center justify-between px-2 transition-opacity duration-300 ${
              overlayShouldShow ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <button
              type="button"
              className={`pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white transition ${
                hasPrev ? 'hover:bg-black/65' : 'cursor-not-allowed opacity-35'
              }`}
              onClick={() => goToOffset(-1)}
              disabled={!hasPrev}
              aria-label="Previous story"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className={`pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white transition ${
                hasNext ? 'hover:bg-black/65' : 'cursor-not-allowed opacity-35'
              }`}
              onClick={() => goToOffset(1)}
              disabled={!hasNext}
              aria-label="Next story"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div
            className={`pointer-events-none absolute bottom-3 left-3 z-20 max-w-[calc(100%-80px)] text-white transition-all duration-300 ${
              overlayShouldShow ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
            }`}
          >
            <div className="rounded-xl bg-black/40 px-3 py-2 text-[11px] font-semibold backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <span>{formatCompactCount(story?.likesCount ?? story?._count?.likes ?? 0)} likes</span>
                <span>{formatCompactCount(story?.commentsCount ?? story?.interactions?.comments)} comments</span>
                <span>{formatCompactCount(story?.repostsCount ?? story?.interactions?.reposts)} reposts</span>
              </div>
            </div>
          </div>

          <div
            className={`absolute right-2.5 top-[58%] z-30 flex -translate-y-1/2 flex-col items-center gap-1.5 transition-all duration-300 ${
              overlayShouldShow ? 'pointer-events-auto translate-x-0 opacity-100' : 'pointer-events-none translate-x-4 opacity-0'
            }`}
          >
            <ReactionBar
              targetType="STORY"
              targetId={String(story?.id || '')}
              layout="rail"
              compact
              className="w-[68px]"
              railVariant="launcher"
              railLauncherLabel="Reaction"
            />
            <OverlayActionRailButton onClick={onComment} icon={MessageCircle} label="Comment" disabled={storyBusy} />
            <OverlayActionRailButton onClick={onRepost} icon={Repeat2} label="Repost" disabled={storyBusy} />
            <OverlayActionRailButton onClick={onDash} icon={Coins} label="Dash" disabled={storyBusy} />
            <OverlayActionRailButton onClick={onSend} icon={Send} label="Send" disabled={storyBusy} />
          </div>
        </div>
      </div>

      <Sheet open={actionsOpen} title="Story options" onClose={() => setActionsOpen(false)}>
        <div className="space-y-1">
          <SheetItem
            icon={<Edit3 className="h-4 w-4" />}
            label="Edit story"
            onClick={() => {
              setActionsOpen(false);
              onEdit();
            }}
          />
          <SheetItem
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete story"
            danger
            onClick={() => {
              setActionsOpen(false);
              onDelete();
            }}
          />
          <SheetItem
            icon={<Eye className="h-4 w-4" />}
            label="Visibility"
            onClick={() => {
              setActionsOpen(false);
              showNotification('info', 'Story', 'Change visibility from Edit story.');
            }}
          />
        </div>
      </Sheet>
    </div>
  );
}


