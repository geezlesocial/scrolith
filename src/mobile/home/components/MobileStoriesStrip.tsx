import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { ChevronLeft, ChevronRight, Coins, MessageCircle, Repeat2, Send, Volume2, VolumeX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useUser } from '../../../context/UserContext';
import { useNotification } from '../../../context/NotificationContext';
import { CommunityService } from '../../../services/community';
import { ScrollService, type ScrollConfig, type ScrollVideo } from '../../../services/scroll';
import { getDefaultStoryTextDraft, getStoryTextStyle, storyTextFonts, storyTextThemes } from '../../../community/storyStyles';
import { UploadedFile } from '../../../types';
import FilePickerModal from '../../../dashboard/shared/FilePickerModal';
import ScrollCreateModal from '../../../features/scroll/ScrollCreateModal';
import { resolveAssetUrl } from '../../../utils/assetUrl';
import ReactionBar from '../../../community/components/ReactionBar';
import RepostModal from '../../../community/components/RepostModal';
import PostShareModal from '../../../community/components/PostShareModal';
import SendGcoinModal from '../../../components/SendGcoinModal';

type StoryKind = 'text' | 'image' | 'video';
type StoryVisibility = 'public' | 'private';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
  const media = story?.media || story?.mediaFile || story?.file || null;
  const url = media?.url || media?.downloadUrl || media?.download_url || null;
  const thumb = media?.thumbnailUrl || media?.thumbnail_url || null;
  const type = String(story?.type || media?.type || '').toLowerCase();
  const mime = String(media?.mimeType || media?.mime_type || '').toLowerCase();
  const isVideo = type === 'video' || mime.startsWith('video/');
  if (isVideo) return { isVideo: true, url: url || thumb || null, thumbnailUrl: thumb || url || null };
  return { isVideo: false, url: url || thumb || null, thumbnailUrl: null };
};

const resolveStoryAuthorName = (story: any, fallback = 'Story') => {
  const normalized = String(story?.authorName || story?.author?.name || '').trim();
  return normalized || fallback;
};

const resolveStoryAuthorAvatar = (story: any) => {
  const normalized = String(story?.authorAvatar || story?.author?.avatar || '').trim();
  return normalized ? resolveAssetUrl(normalized) : '';
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

const resolveStoryTypeFromFile = (file: UploadedFile): StoryKind | null => {
  const explicit = String(file?.type || '').toLowerCase();
  const mime = String(file?.mime_type || file?.mimeType || '').toLowerCase();
  if (explicit === 'video' || mime.startsWith('video/')) return 'video';
  if (explicit === 'image' || mime.startsWith('image/')) return 'image';
  return null;
};

const resolveScrollMediaUrl = (scroll: ScrollVideo) => resolveAssetUrl(String(scroll?.media?.url || '').trim());

const resolveScrollAuthorName = (scroll: ScrollVideo, fallback = 'Scrolith') => {
  const normalized = String(scroll?.author?.name || '').trim();
  return normalized || fallback;
};

const resolveScrollAuthorAvatar = (scroll: ScrollVideo) => {
  const normalized = String(scroll?.author?.avatar || '').trim();
  return normalized ? resolveAssetUrl(normalized) : '';
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
  const { showNotification } = useNotification();

  const enabled = settings?.stories?.enabled !== false;
  const maxItems = clamp(Number(settings?.stories?.maxItems ?? 12) || 12, 4, 40);
  const maxScrollItems = clamp(Number(settings?.stories?.maxReels ?? settings?.stories?.maxItems ?? 12) || 12, 4, 40);

  const [stories, setStories] = useState<any[]>([]);
  const [scrolls, setScrolls] = useState<ScrollVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [scrollsLoading, setScrollsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrollError, setScrollError] = useState<string | null>(null);
  const [activeStory, setActiveStory] = useState<any | null>(null);
  const [storyRailTab, setStoryRailTab] = useState<'stories' | 'scroll'>('stories');
  const [scrollCreateOpen, setScrollCreateOpen] = useState(false);
  const [scrollConfig, setScrollConfig] = useState<ScrollConfig | null>(null);

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
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [storyActionTarget, setStoryActionTarget] = useState<any | null>(null);
  const [storyCommentOpen, setStoryCommentOpen] = useState(false);
  const [storyCommentDraft, setStoryCommentDraft] = useState('');
  const [storyRepostOpen, setStoryRepostOpen] = useState(false);
  const [storySendOpen, setStorySendOpen] = useState(false);
  const [storyDashOpen, setStoryDashOpen] = useState(false);
  const [storyActionBusy, setStoryActionBusy] = useState<Record<string, boolean>>({});

  const visibleStories = useMemo(() => {
    const list = Array.isArray(stories) ? stories : [];
    return list.filter(isStoryActive).slice(0, maxItems);
  }, [stories, maxItems]);

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
    if (typeof window === 'undefined') return `https://scrolith.com/community/stories/${encodeURIComponent(storyId)}`;
    return `${window.location.origin}/community/stories/${encodeURIComponent(storyId)}`;
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
    if (!enabled) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    CommunityService.getStoriesFeed()
      .then((items) => {
        if (!mounted) return;
        setStories(Array.isArray(items) ? items.filter(isStoryActive).slice(0, maxItems) : []);
      })
      .catch((e: any) => {
        if (!mounted) return;
        setError(e?.response?.data?.error || e?.message || 'Failed to load stories');
        setStories([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [enabled, maxItems]);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    setScrollsLoading(true);
    setScrollError(null);
    ScrollService.getFeed({ limit: maxScrollItems })
      .then((feed) => {
        if (!mounted) return;
        const items = Array.isArray(feed?.items)
          ? feed.items.filter((item) => String(item?.status || '').toUpperCase() !== 'REMOVED').slice(0, maxScrollItems)
          : [];
        setScrolls(items);
        setScrollConfig(feed?.config || null);
      })
      .catch((e: any) => {
        if (!mounted) return;
        setScrollError(e?.response?.data?.error || e?.message || 'Failed to load Scroll videos');
        setScrolls([]);
        setScrollConfig(null);
      })
      .finally(() => {
        if (mounted) setScrollsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [enabled, maxScrollItems]);

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

  const canPublish = (() => {
    if (draftType === 'text') return draftContent.trim().length > 0;
    if (draftType === 'image' || draftType === 'video') return Boolean(draftMediaFile?.id);
    return false;
  })();

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
        <div className="mb-2 inline-flex items-center rounded-full border border-slate-200 bg-white p-1">
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

              {loading ? (
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : error ? (
                <div className="rounded-2xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700">
                  {error}
                </div>
              ) : visibleStories.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                  No stories yet.
                </div>
              ) : (
                visibleStories.map((story) => {
                  const id = String(story?.id || '').trim();
                  const name = resolveStoryAuthorName(story, 'Story');
                  const avatar = resolveStoryAuthorAvatar(story);
                  const media = resolveStoryMediaUrl(story);
                  const fallbackLetter = resolveStoryAuthorInitial(story);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setActiveStory(story);
                        if (id) CommunityService.viewStory(id).catch(() => {});
                      }}
                      className="relative h-[154px] w-[92px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900"
                      aria-label={`Open story by ${name}`}
                    >
                      {media.url ? (
                        media.isVideo ? (
                          <video
                            src={media.url}
                            className="h-full w-full object-cover"
                            autoPlay
                            muted
                            playsInline
                            loop
                            preload="metadata"
                          />
                        ) : (
                          <img src={media.url} alt="Story" className="h-full w-full object-cover" />
                        )
                      ) : avatar ? (
                        <img src={avatar} alt={name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white">
                          {fallbackLetter}
                        </div>
                      )}
                      <div className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-blue-300/90 bg-slate-700 text-[11px] font-semibold text-white shadow">
                        {avatar ? (
                          <img src={avatar} alt={name} className="h-full w-full object-cover" />
                        ) : (
                          <span>{fallbackLetter}</span>
                        )}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left">
                        <p className="line-clamp-1 text-[10px] font-semibold text-white">{name}</p>
                        <p className="line-clamp-1 text-[10px] text-white/80">
                          {resolveStoryContent(story) || (media.isVideo ? 'Video story' : 'Photo story')}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </>
          ) : (
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

              {scrollsLoading ? (
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading Scroll...
                </div>
              ) : scrollError ? (
                <div className="rounded-2xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700">
                  {scrollError}
                </div>
              ) : scrolls.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                  No Scroll videos yet.
                </div>
              ) : (
                scrolls.map((scroll) => {
                  const id = String(scroll?.id || '').trim();
                  const mediaUrl = resolveScrollMediaUrl(scroll);
                  const authorName = resolveScrollAuthorName(scroll, 'Scrolith');
                  const authorAvatar = resolveScrollAuthorAvatar(scroll);
                  const authorInitial = resolveScrollAuthorInitial(scroll);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => navigate(`/scroll?scroll=${encodeURIComponent(id)}`)}
                      className="relative h-[154px] w-[92px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900"
                      aria-label={`Open Scroll by ${authorName}`}
                    >
                      {mediaUrl ? (
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
                        <div className="flex h-full w-full items-center justify-center text-xs text-white/80">Scroll</div>
                      )}
                      <div className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-blue-300/90 bg-slate-700 text-[11px] font-semibold text-white shadow">
                        {authorAvatar ? (
                          <img src={authorAvatar} alt={authorName} className="h-full w-full object-cover" />
                        ) : (
                          <span>{authorInitial}</span>
                        )}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left">
                        <p className="line-clamp-1 text-[10px] font-semibold text-white">{authorName}</p>
                        <p className="line-clamp-1 text-[10px] text-white/80">{scroll.title || scroll.description || 'Scroll'}</p>
                      </div>
                    </button>
                  );
                })
              )}
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
              onClick={() => setMediaPickerOpen(true)}
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
                    onClick={() => setMediaPickerOpen(true)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                    disabled={publishing}
                  >
                    Change media
                  </button>
                </div>
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

      <FilePickerModal
        isOpen={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        allowUpload
        allowCamera
        filterType="all"
        acceptedTypes={['image', 'video']}
        title={composerMode === 'edit' ? 'Change story media' : 'Select story media'}
        onSelect={(file) => {
          setMediaPickerOpen(false);
          if (!user?.id) {
            navigate('/auth/login');
            return;
          }
          const type = resolveStoryTypeFromFile(file);
          if (!type) {
            showNotification('error', 'Story', 'Please select an image or video.');
            return;
          }
          setDraftType(type);
          setDraftMediaFile(file);
          setComposerStep('compose');
          setComposerOpen(true);
        }}
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
        postUrl={storyActionTarget?.id ? buildStoryUrl(String(storyActionTarget.id)) : 'https://scrolith.com/community'}
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
  storyBusy
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
}) {
  const { showNotification } = useNotification();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapAtRef = useRef(0);

  const name = resolveStoryAuthorName(story, 'Story');
  const avatar = resolveStoryAuthorAvatar(story);
  const type = resolveStoryType(story);
  const media = resolveStoryMediaUrl(story);
  const content = resolveStoryContent(story);
  const canManage = canManageStory(story, viewer);
  const style = getStoryTextStyle(story);
  const activeIndex = story?.id ? stories.findIndex((entry) => String(entry?.id) === String(story.id)) : -1;
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < stories.length - 1;

  const goToOffset = (offset: number) => {
    if (activeIndex < 0) return;
    const next = stories[activeIndex + offset];
    if (!next) return;
    onNavigate(next);
  };

  return (
    <div className="fixed inset-0 z-[950] bg-black">
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
            <div className="truncate text-[11px] text-white/70">
              {type === 'text' ? 'Text story' : type === 'video' ? 'Video story' : 'Photo story'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

      <div className="relative flex h-[calc(100%-56px)] items-center justify-center px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div
          className="relative h-full w-full max-w-md overflow-hidden rounded-3xl bg-slate-900"
          onTouchStart={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('button, a, input, textarea, select, label')) {
              touchStartRef.current = null;
              return;
            }
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
            if (Math.abs(deltaX) >= 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
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
              <span className="whitespace-pre-wrap">{content || 'Story'}</span>
            </div>
          ) : media.url ? (
            type === 'video' || media.isVideo ? (
              <video src={media.url} className="h-full w-full object-cover" controls autoPlay muted={muted} playsInline loop preload="metadata" />
            ) : (
              <img src={media.url} alt="Story" className="h-full w-full object-cover" />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-white/80">Story media not available.</div>
          )}
          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/10 to-black/45" />

          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-30 flex items-center justify-between px-2">
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

          <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[calc(100%-80px)] text-white">
            <div className="rounded-xl bg-black/40 px-3 py-2 text-[11px] font-semibold backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <span>{formatCompactCount(story?.likesCount ?? story?._count?.likes ?? 0)} likes</span>
                <span>{formatCompactCount(story?.commentsCount ?? story?.interactions?.comments)} comments</span>
                <span>{formatCompactCount(story?.repostsCount ?? story?.interactions?.reposts)} reposts</span>
              </div>
            </div>
          </div>

          <div className="absolute right-2.5 top-[58%] z-30 flex -translate-y-1/2 flex-col items-center gap-1.5 pointer-events-auto">
            <ReactionBar targetType="STORY" targetId={String(story?.id || '')} layout="rail" compact className="w-[54px]" />
            <button
              type="button"
              onClick={onComment}
              className="inline-flex min-w-[52px] flex-col items-center rounded-xl bg-black/45 px-1.5 py-1.5 text-white transition hover:bg-black/65"
              disabled={storyBusy}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="mt-1 text-[10px] font-semibold">{formatCompactCount(story?.commentsCount ?? story?.interactions?.comments)}</span>
            </button>
            <button
              type="button"
              onClick={onRepost}
              className="inline-flex min-w-[52px] flex-col items-center rounded-xl bg-black/45 px-1.5 py-1.5 text-white transition hover:bg-black/65"
              disabled={storyBusy}
            >
              <Repeat2 className="h-3.5 w-3.5" />
              <span className="mt-1 text-[10px] font-semibold">{formatCompactCount(story?.repostsCount ?? story?.interactions?.reposts)}</span>
            </button>
            <button
              type="button"
              onClick={onDash}
              className="inline-flex min-w-[52px] flex-col items-center rounded-xl bg-black/45 px-1.5 py-1.5 text-white transition hover:bg-black/65"
              disabled={storyBusy}
            >
              <Coins className="h-3.5 w-3.5" />
              <span className="mt-1 text-[10px] font-semibold">Dash</span>
            </button>
            <button
              type="button"
              onClick={onSend}
              className="inline-flex min-w-[52px] flex-col items-center rounded-xl bg-black/45 px-1.5 py-1.5 text-white transition hover:bg-black/65"
              disabled={storyBusy}
            >
              <Send className="h-3.5 w-3.5" />
              <span className="mt-1 text-[10px] font-semibold">{formatCompactCount(story?.sendsCount ?? story?.interactions?.sends)}</span>
            </button>
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
