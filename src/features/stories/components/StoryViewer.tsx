import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MoreVertical, Pencil, RefreshCw, Send, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import FollowButton from '../../../community/components/FollowButton';
import { getStoryTextStyle } from '../../../community/storyStyles';
import ExpandablePreviewText from '../../../components/common/ExpandablePreviewText';
import InlineAutoplayVideo from '../../../components/media/InlineAutoplayVideo';
import VideoCaptionOverlay from '../../../components/media/VideoCaptionOverlay';
import StoryAuthorAvatar from '../../../components/stories/StoryAuthorAvatar';
import { useNotification } from '../../../context/NotificationContext';
import { usePerformanceProfile } from '../../../hooks/usePerformanceProfile';
import { resolveInlineMedia } from '../../../utils/inlineMedia';
import { resolvePostAttachmentMediaUrl } from '../../../utils/postAttachmentMedia';
import { resolveUserAvatarUrl } from '../../../utils/userAvatar';
import { StoryMessagingService, type StoryQuickReaction } from '../services/storyMessaging';

type StoryKind = 'text' | 'image' | 'video';

const STORY_AUTO_ADVANCE_MS = 5500;
const STORY_VIDEO_FALLBACK_ADVANCE_MS = 9000;
const STORY_AUTO_ADVANCE_MAX_MS = 30000;
const QUICK_REACTIONS: Array<{ id: StoryQuickReaction; label: string; name: string }> = [
  { id: 'love', label: '\u2764\uFE0F', name: 'love' },
  { id: 'like', label: '\u{1F44D}', name: 'like' },
  { id: 'haha', label: '\u{1F602}', name: 'laugh' }
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const isInteractiveTarget = (target: EventTarget | null) =>
  Boolean((target as HTMLElement | null)?.closest('button, a, input, textarea, select, label, [role="menu"]'));

const resolveStoryType = (story: any): StoryKind => {
  const raw = String(story?.type || story?.storyType || story?.media?.type || '').trim().toLowerCase();
  if (raw === 'video') return 'video';
  if (raw === 'image') return 'image';
  const media = resolveInlineMedia(story, { typeHint: raw || story?.type });
  if (media.kind === 'video') return 'video';
  if (media.kind === 'image') return 'image';
  return 'text';
};

const resolveStoryMedia = (story: any) => {
  const media = resolveInlineMedia(story, { typeHint: story?.type });
  return {
    isVideo: media.kind === 'video',
    url: media.src || null,
    fallbackUrl: media.fallbackSrc || null,
    thumbnailUrl: media.poster || null
  };
};

const preloadStoryMedia = (story: any, eager = false) => {
  if (typeof window === 'undefined' || !story) return () => {};
  const media = resolveStoryMedia(story);
  if (!media.url) return () => {};

  if (media.isVideo) {
    const video = document.createElement('video');
    video.preload = eager ? 'auto' : 'metadata';
    video.muted = true;
    video.playsInline = true;
    if (media.thumbnailUrl) video.poster = media.thumbnailUrl;
    video.src = media.url;
    try {
      video.load();
    } catch {
      // Browsers can reject preloading under data saver or memory pressure.
    }
    return () => {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        // Best-effort cleanup for detached preload elements.
      }
    };
  }

  const image = new Image();
  image.decoding = 'async';
  image.src = media.url;
  if (typeof image.decode === 'function') {
    image.decode().catch(() => undefined);
  }
  return () => {
    image.onload = null;
    image.onerror = null;
  };
};

const resolveStoryContent = (story: any) =>
  String(story?.content ?? story?.caption ?? story?.text ?? story?.storyText ?? story?.story_text ?? '').trim();

const resolveStoryOwnerId = (story: any) =>
  String(story?.authorId || story?.userId || story?.user_id || story?.author?.id || '').trim();

const resolveStoryAuthorName = (story: any, fallback = 'Story') => {
  const normalized = String(
    story?.authorName ||
      story?.author?.displayName ||
      story?.author?.name ||
      story?.author?.username ||
      story?.userName ||
      story?.user_name ||
      story?.user?.displayName ||
      story?.user?.name ||
      story?.user?.username ||
      ''
  ).trim();
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
  const viewerTokens = [viewer?.id, viewer?.user_id, viewer?.username, viewer?.user_name, viewer?.name, viewer?.email]
    .map(normalizeOwnerToken)
    .filter(Boolean);
  if (!storyOwnerTokens.some((token) => viewerTokens.includes(token))) return '';
  return resolveUserAvatarUrl(viewer) || '';
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
  if (profilePhotoFileId) return resolvePostAttachmentMediaUrl({ fileId: profilePhotoFileId });

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
    avatar: story?.avatar || story?.author?.avatar || story?.user?.avatar || story?.authorPhoto || story?.author_photo,
    profilePhotoFileId:
      story?.authorAvatarFileId ||
      story?.author_avatar_file_id ||
      story?.profilePhotoFileId ||
      story?.author?.profilePhotoFileId ||
      story?.user?.profilePhotoFileId,
    profile_photo_file_id:
      story?.profile_photo_file_id || story?.author?.profile_photo_file_id || story?.user?.profile_photo_file_id,
    avatarFileId: story?.avatarFileId || story?.author?.avatarFileId || story?.user?.avatarFileId,
    avatar_file_id: story?.avatar_file_id || story?.author?.avatar_file_id || story?.user?.avatar_file_id
  }) || resolveViewerProfileAvatar(story, viewer);
};

const resolveStoryAuthorProfileUrl = (story: any) => {
  const companySlug = String(
    story?.author?.businessSlug ||
      story?.author?.companySlug ||
      story?.author?.pageSlug ||
      story?.page?.slug ||
      story?.businessPage?.slug ||
      ''
  ).trim();
  if (companySlug) return `/company/${encodeURIComponent(companySlug)}`;

  const username = String(
    story?.authorUsername ||
      story?.author?.username ||
      story?.userName ||
      story?.user_name ||
      story?.user?.username ||
      ''
  ).trim().replace(/^@+/, '');
  if (username) return `/u/${encodeURIComponent(username)}`;

  const authorId = resolveStoryOwnerId(story);
  if (authorId) return `/profile/${encodeURIComponent(authorId)}`;
  return null;
};

const resolveStoryTimestamp = (story: any) => {
  const value = story?.createdAt || story?.created_at || story?.timestamp;
  const time = new Date(value || '').getTime();
  if (!Number.isFinite(time)) return '';
  const diff = Date.now() - time;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))}h`;
  return `${Math.max(1, Math.floor(diff / 86_400_000))}d`;
};

const resolveStoryAutoAdvanceDelay = (story: any) => {
  if (resolveStoryType(story) !== 'video') return STORY_AUTO_ADVANCE_MS;
  const durationSeconds = Number(story?.media?.duration ?? story?.duration ?? story?.mediaDuration ?? 0);
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return Math.max(4000, Math.min(STORY_AUTO_ADVANCE_MAX_MS, Math.round(durationSeconds * 1000 + 350)));
  }
  return STORY_VIDEO_FALLBACK_ADVANCE_MS;
};

export default function StoryViewer({
  story,
  stories,
  viewer,
  onClose,
  onNavigate,
  onEdit,
  onDelete,
  onUpdate,
  canManage,
  autoplayEnabled
}: {
  story: any;
  stories: any[];
  viewer: any;
  onClose: () => void;
  onNavigate: (nextStory: any) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Replace media / full update flow for image & video stories */
  onUpdate?: () => void;
  canManage?: boolean;
  autoplayEnabled?: boolean;
}) {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const { profile } = usePerformanceProfile();
  const [muted, setMuted] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [pointerPaused, setPointerPaused] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [interactionBusy, setInteractionBusy] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const progressElapsedRef = useRef(0);

  const storyList = Array.isArray(stories) ? stories : [];
  const activeIndex = story?.id ? storyList.findIndex((entry) => String(entry?.id) === String(story.id)) : -1;
  const preloadTargets = useMemo(() => {
    const source = activeIndex >= 0 ? storyList : story ? [story] : [];
    if (!source.length) return [] as Array<{ story: any; eager: boolean }>;
    const indexes = activeIndex >= 0 ? [activeIndex - 1, activeIndex, activeIndex + 1] : [0];
    return indexes
      .filter((index) => index >= 0 && index < source.length)
      .map((index) => ({ story: source[index], eager: index === activeIndex || activeIndex < 0 }))
      .filter((entry) => Boolean(entry.story?.id || resolveStoryMedia(entry.story).url));
  }, [activeIndex, story, storyList]);
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < storyList.length - 1;
  const name = resolveStoryAuthorName(story, 'Story');
  const avatar = resolveStoryAuthorAvatar(story, viewer);
  const authorProfileUrl = resolveStoryAuthorProfileUrl(story);
  const ownerId = resolveStoryOwnerId(story);
  const type = resolveStoryType(story);
  const media = resolveStoryMedia(story);
  const content = resolveStoryContent(story);
  const timestamp = resolveStoryTimestamp(story);
  const style = getStoryTextStyle(story);
  const mediaLoadFailed = imageLoadFailed || videoLoadFailed;
  const mediaRequiresLoad = type !== 'text' && Boolean(media.url);
  const mediaLoading = mediaRequiresLoad && !mediaReady && !mediaLoadFailed;
  const hasMessageDraft = messageDraft.trim().length > 0;
  const viewerOwnsStory = Boolean(
    viewer?.id &&
      ownerId &&
      String(ownerId) === String(viewer.id)
  );
  const manageEnabled =
    typeof canManage === 'boolean'
      ? canManage
      : viewerOwnsStory ||
        String(viewer?.role || '')
          .toLowerCase()
          .includes('admin');
  const showOwnerMenu = manageEnabled && Boolean(onEdit || onDelete || onUpdate);
  const shouldPause =
    pointerPaused ||
    inputFocused ||
    interactionBusy ||
    documentHidden ||
    mediaLoading ||
    hasMessageDraft ||
    actionsOpen;
  const effectiveAutoplayEnabled = autoplayEnabled ?? profile.autoplayEnabled;

  const resetStoryProgress = useCallback(() => {
    progressElapsedRef.current = 0;
    setProgressPercent(0);
  }, []);

  const goToOffset = useCallback(
    (offset: number) => {
      if (activeIndex < 0) return;
      const next = storyList[activeIndex + offset];
      if (!next) return;
      onNavigate(next);
    },
    [activeIndex, onNavigate, storyList]
  );

  const advanceStory = useCallback(() => {
    if (hasNext) {
      goToOffset(1);
      return;
    }
    onClose();
  }, [goToOffset, hasNext, onClose]);

  useEffect(() => {
    setImageLoadFailed(false);
    setVideoLoadFailed(false);
    setMediaReady(type === 'text' || !media.url);
    setMessageDraft('');
    setInputFocused(false);
    setPointerPaused(false);
    setActionsOpen(false);
    progressElapsedRef.current = 0;
    setProgressPercent(0);
  }, [media.url, story?.id, type]);

  useEffect(() => {
    if (!actionsOpen) return undefined;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (actionsMenuRef.current && target && !actionsMenuRef.current.contains(target)) {
        setActionsOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [actionsOpen]);

  useEffect(() => {
    if (!preloadTargets.length) return undefined;
    const targets = profile.lowBandwidth || profile.dataSaver
      ? preloadTargets.filter((entry) => entry.eager)
      : preloadTargets;
    const cleanups = targets.map((entry) => preloadStoryMedia(entry.story, entry.eager));
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [preloadTargets, profile.dataSaver, profile.lowBandwidth]);

  useEffect(() => {
    if (!mediaLoading) return;
    resetStoryProgress();
  }, [mediaLoading, resetStoryProgress]);

  const markMediaReady = useCallback(() => {
    setMediaReady(true);
  }, []);

  const markMediaFailed = useCallback((kind: StoryKind) => {
    if (kind === 'video') {
      setVideoLoadFailed(true);
    } else if (kind === 'image') {
      setImageLoadFailed(true);
    }
    setMediaReady(true);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => setDocumentHidden(document.visibilityState === 'hidden');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    if (!story?.id || shouldPause) return;
    const duration = resolveStoryAutoAdvanceDelay(story);
    const startedAt = performance.now() - progressElapsedRef.current;
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      progressElapsedRef.current = elapsed;
      const nextProgress = clamp((elapsed / duration) * 100, 0, 100);
      setProgressPercent(nextProgress);
      if (elapsed >= duration) {
        advanceStory();
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [advanceStory, shouldPause, story?.id, story?.media?.duration]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isInteractiveTarget(event.target)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToOffset(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToOffset(-1);
      } else if (event.key === ' ') {
        event.preventDefault();
        setPointerPaused((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToOffset, onClose]);

  const keepStoryOpenForLoginRequired = useCallback(() => {
    showNotification(
      'info',
      'Stories',
      'Please sign in to send story messages or reactions.'
    );
  }, [showNotification]);

  const emitStoryMessagingEvent = useCallback(
    (
      result: Awaited<ReturnType<typeof StoryMessagingService.sendMessage>>,
      detail: { reactionType?: StoryQuickReaction; text?: string }
    ) => {
      if (typeof window === 'undefined') return;
      const payload = {
        storyId: String(story?.id || ''),
        ownerId,
        conversationId: result?.conversationId || null,
        messageId: result?.messageId || null,
        ...detail
      };
      window.dispatchEvent(new CustomEvent('story:direct_message_sent', { detail: payload }));
      if (result?.conversationId) {
        window.dispatchEvent(
          new CustomEvent('messages:conversation_updated', {
            detail: {
              conversationId: result.conversationId,
              source: 'story',
              storyId: payload.storyId
            }
          })
        );
      }
    },
    [ownerId, story?.id]
  );

  const handleReaction = async (reactionType: StoryQuickReaction) => {
    if (!viewer?.id) {
      keepStoryOpenForLoginRequired();
      return;
    }
    if (!story?.id || interactionBusy) return;
    resetStoryProgress();
    setInteractionBusy(true);
    try {
      const result = await StoryMessagingService.sendReaction(String(story.id), reactionType, { story, viewer });
      emitStoryMessagingEvent(result, { reactionType });
      resetStoryProgress();
      showNotification('success', 'Stories', 'Reaction sent as a message.');
    } catch (error: any) {
      showNotification('error', 'Stories', error?.response?.data?.error || error?.message || 'Unable to send reaction.');
    } finally {
      setInteractionBusy(false);
    }
  };

  const handleMessageSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = messageDraft.trim();
    if (!viewer?.id) {
      keepStoryOpenForLoginRequired();
      return;
    }
    if (!story?.id || !text || interactionBusy) return;
    resetStoryProgress();
    setInteractionBusy(true);
    try {
      const result = await StoryMessagingService.sendMessage(String(story.id), text, { story, viewer });
      emitStoryMessagingEvent(result, { text });
      setMessageDraft('');
      resetStoryProgress();
      showNotification('success', 'Stories', 'Message sent to the story owner.');
    } catch (error: any) {
      showNotification('error', 'Stories', error?.response?.data?.error || error?.message || 'Unable to send message.');
    } finally {
      setInteractionBusy(false);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) return;
    gestureStartRef.current = { x: event.clientX, y: event.clientY };
    setPointerPaused(true);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) return;
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    setPointerPaused(false);
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaY) > 72 && deltaY > Math.abs(deltaX) * 1.2) {
      onClose();
      return;
    }
    if (Math.abs(deltaX) > 54 && Math.abs(deltaX) > Math.abs(deltaY) + 12) {
      goToOffset(deltaX > 0 ? -1 : 1);
      return;
    }
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 18) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const tapX = event.clientX - bounds.left;
    goToOffset(tapX < bounds.width / 2 ? -1 : 1);
  };

  const openAuthorProfile = () => {
    if (!authorProfileUrl) return;
    onClose();
    navigate(authorProfileUrl, { state: { fromStory: true } });
  };

  return (
    <div
      className="fixed inset-0 z-[950] bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Story by ${name}`}
    >
      {media.url && type !== 'text' && !media.isVideo ? (
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-45 blur-3xl scale-110"
          style={{ backgroundImage: `url("${media.url}")` }}
        />
      ) : null}
      <div className="absolute inset-0 bg-black/70" />

      <div className="relative z-10 flex h-[100dvh] w-full flex-col">
        <header className="px-3 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-5">
          <div className="mb-3 flex items-center gap-1.5">
            {storyList.map((entry, index) => {
              const key = String(entry?.id || index);
              const fill = index < activeIndex ? 100 : index === activeIndex ? progressPercent : 0;
              return (
                <div key={key} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full rounded-full bg-white transition-[width] duration-100" style={{ width: `${fill}%` }} />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={openAuthorProfile}
              disabled={!authorProfileUrl}
              className="flex min-w-0 items-center gap-3 text-left disabled:cursor-default"
            >
              <StoryAuthorAvatar
                src={avatar}
                user={story?.author || story}
                availableForHire={Boolean(story?.author?.availableForHire ?? story?.availableForHire)}
                weAreHiring={Boolean(story?.author?.weAreHiring ?? story?.weAreHiring)}
                name={name}
                initial={name.charAt(0) || 'S'}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/25 bg-white/10 text-xs font-semibold text-white"
                width={80}
                height={80}
                sizes="40px"
              />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold">{name}</span>
                  {story?.isLive || story?.live ? (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase">Live</span>
                  ) : null}
                  {story?.sponsored || story?.isSponsored ? (
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase">
                      Sponsored
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/70">
                  {timestamp ? <span>{timestamp}</span> : null}
                  {ownerId && String(ownerId) !== String(viewer?.id || '') ? (
                    <FollowButton
                      targetUserId={ownerId}
                      currentUserId={viewer?.id}
                      initialIsFollowing={
                        typeof story?.viewer?.isFollowingAuthor === 'boolean'
                          ? Boolean(story.viewer.isFollowingAuthor)
                          : undefined
                      }
                      onRequireLogin={keepStoryOpenForLoginRequired}
                      className="h-6 border-white/30 bg-white/10 px-2.5 text-[10px] text-white hover:bg-white/15"
                    />
                  ) : null}
                </div>
              </div>
            </button>

            <div className="flex shrink-0 items-center gap-2">
              {type !== 'text' && media.url ? (
                <button
                  type="button"
                  onClick={() => setMuted((prev) => !prev)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55"
                  aria-label={muted ? 'Unmute story' : 'Mute story'}
                >
                  {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
              ) : null}
              {showOwnerMenu ? (
                <div className="relative" ref={actionsMenuRef} data-testid="story-owner-menu">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setActionsOpen((prev) => !prev);
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55"
                    aria-label="Story options"
                    aria-expanded={actionsOpen}
                    aria-haspopup="menu"
                    data-testid="story-owner-menu-trigger"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                  {actionsOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 top-12 z-20 min-w-[11.5rem] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 p-1 text-sm shadow-2xl backdrop-blur"
                    >
                      {onEdit ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setActionsOpen(false);
                            onEdit();
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-white hover:bg-white/10"
                          data-testid="story-menu-edit"
                        >
                          <Pencil className="h-4 w-4 shrink-0 text-white/80" aria-hidden />
                          Edit story
                        </button>
                      ) : null}
                      {onUpdate && type !== 'text' ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setActionsOpen(false);
                            onUpdate();
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-white hover:bg-white/10"
                          data-testid="story-menu-update"
                        >
                          <RefreshCw className="h-4 w-4 shrink-0 text-white/80" aria-hidden />
                          Update media
                        </button>
                      ) : null}
                      {onDelete ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setActionsOpen(false);
                            onDelete();
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-red-200 hover:bg-red-500/15"
                          data-testid="story-menu-delete"
                        >
                          <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                          Delete story
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55"
                aria-label="Close story"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <main
          className="relative min-h-0 flex-1 select-none overflow-hidden"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            gestureStartRef.current = null;
            setPointerPaused(false);
          }}
          style={{ touchAction: 'none' }}
        >
          {mediaLoading ? (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/20 px-6 text-center">
              <div className="inline-flex items-center gap-3 rounded-full bg-black/65 px-4 py-2 text-sm font-semibold text-white shadow-2xl backdrop-blur">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading story...</span>
              </div>
            </div>
          ) : null}
          {type === 'text' ? (
            <div
              className="mx-auto flex h-full w-full max-w-[720px] items-center justify-center px-8 text-center"
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
                textClassName="text-2xl font-semibold leading-tight sm:text-3xl"
                buttonClassName="text-white"
              />
            </div>
          ) : media.url && !(imageLoadFailed && !media.isVideo) ? (
            media.isVideo ? (
              <InlineAutoplayVideo
                key={String(story?.id || media.url || '')}
                src={media.url}
                fallbackSrc={media.fallbackUrl}
                poster={media.thumbnailUrl}
                className="h-full w-full object-contain"
                containerClassName="mx-auto h-full w-full max-w-[720px]"
                controls={false}
                loop={false}
                preload="auto"
                eagerLoad
                active
                autoplayEnabled={effectiveAutoplayEnabled && !shouldPause}
                muted={muted}
                onMutedChange={setMuted}
                onLoadStart={() => setMediaReady(false)}
                onLoadedData={markMediaReady}
                onCanPlay={markMediaReady}
                onPlaying={markMediaReady}
                onError={() => markMediaFailed('video')}
                onEnded={() => {
                  if (!shouldPause && (mediaReady || videoLoadFailed)) advanceStory();
                }}
                showMuteToggle={false}
                loadingLabel={false}
              />
            ) : (
                <img
                  src={media.url}
                  alt=""
                  className="mx-auto h-full w-full max-w-[720px] object-contain"
                  decoding="async"
                  fetchPriority="high"
                  loading="eager"
                  draggable={false}
                  onLoad={markMediaReady}
                  onError={() => markMediaFailed('image')}
                />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-white/75">
              Story media not available.
            </div>
          )}
          {type !== 'text' && content ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-4 sm:bottom-5">
              <VideoCaptionOverlay text={content} className="max-w-[min(42rem,100%)]" />
            </div>
          ) : null}
        </main>

        <footer className="px-3 pb-[calc(0.85rem+env(safe-area-inset-bottom))] pt-3 sm:px-5">
          <div className="mx-auto flex w-full max-w-[720px] items-center gap-2">
            <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={handleMessageSubmit}>
              <label className="sr-only" htmlFor={`story-message-${String(story?.id || 'active')}`}>
                Send message from story
              </label>
              <input
                id={`story-message-${String(story?.id || 'active')}`}
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder="Send message..."
                disabled={interactionBusy}
                autoComplete="off"
                enterKeyHint="send"
                className="h-12 min-w-0 flex-1 rounded-full border border-white/25 bg-black/30 px-4 text-sm font-medium text-white outline-none backdrop-blur placeholder:text-white/70 focus:border-white/60"
              />
              <button
                type="submit"
                disabled={!messageDraft.trim() || interactionBusy}
                className="inline-flex h-12 min-w-[4.25rem] shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-3 text-slate-950 shadow-lg transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/35 disabled:text-white/55 disabled:shadow-none"
                aria-label="Send story message"
              >
                {interactionBusy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span className="text-sm font-bold">Send</span>
                  </>
                )}
              </button>
            </form>
            <div className="flex shrink-0 items-center gap-1.5" aria-label="Quick reactions">
              {QUICK_REACTIONS.map((reaction) => (
                <button
                  key={reaction.id}
                  type="button"
                  onClick={() => void handleReaction(reaction.id)}
                  disabled={interactionBusy}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-lg backdrop-blur transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45 sm:h-11 sm:w-11 sm:text-xl"
                  aria-label={`React ${reaction.name} to story`}
                >
                  {reaction.label}
                </button>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
