import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Clapperboard,
  ExternalLink,
  FileText,
  Heart,
  Image as ImageIcon,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Video,
  X
} from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { CommunityService } from '../../services/community';
import { FileService } from '../../services/files';
import { ScrollService, type ScrollVideo } from '../../services/scroll';
import { resolveAssetUrl } from '../../utils/assetUrl';
import {
  resolvePostAttachmentMediaUrl,
  resolvePostAttachmentPosterUrl
} from '../../utils/postAttachmentMedia';
import {
  postAiInsightPreferenceToBoolean,
  resolvePostAiInsightPreference,
  resolveStoredPostAiInsightPreference,
  type PostAiInsightPreference
} from '../../utils/postAiControls';
import OptimizedImage from '../../components/media/OptimizedImage';
import InlineAutoplayVideo from '../../components/media/InlineAutoplayVideo';
import ScrollCreateModal from '../../features/scroll/ScrollCreateModal';
import { ConfirmModal } from './ConfirmModal';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

type MediaDraft = {
  localId: string;
  id?: string;
  url: string;
  name?: string;
  type?: 'image' | 'video' | 'document';
  mimeType?: string;
  thumbnailUrl?: string | null;
  uploading?: boolean;
  progress?: number;
  error?: string;
};

type EditDraft = {
  title: string;
  content: string;
  topic: string;
  location: string;
  visibility: string;
  commentPolicy: string;
  graphicWarning: boolean;
  isAIEnhanced: boolean;
  aiInsightPreference: PostAiInsightPreference;
  media: MediaDraft[];
};

const inferType = (media: any): 'image' | 'video' | 'document' => {
  const explicit = String(media?.type || media?.kind || '').toLowerCase();
  if (explicit === 'image' || explicit === 'video' || explicit === 'document') return explicit;
  const mime = String(media?.mimeType || media?.mime_type || '').toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  const hay = `${media?.url || ''} ${media?.name || ''}`.toLowerCase();
  if (/\.(mp4|webm|mov|m4v)(?:$|[?#])/.test(hay)) return 'video';
  if (/\.(png|jpe?g|gif|webp)(?:$|[?#])/.test(hay)) return 'image';
  return 'document';
};

const mediaSrc = (media: MediaDraft) => {
  const raw = String(media.url || '').trim();
  if (raw.startsWith('blob:') || raw.startsWith('data:')) return raw;
  return resolvePostAttachmentMediaUrl(media) || resolveAssetUrl(raw) || raw;
};

const mapAttachments = (post: any): MediaDraft[] => {
  const list = Array.isArray(post?.attachments) ? post.attachments : [];
  return list
    .map((item: any, index: number) => {
      if (!item) return null;
      const id = String(item.id || item.fileId || item.file_id || '').trim();
      const url = String(item.url || resolvePostAttachmentMediaUrl(item) || '').trim();
      return {
        localId: `${post.id || 'post'}-media-${id || index}`,
        id: id || undefined,
        url,
        name: item.name || item.originalName || item.filename,
        type: inferType(item),
        mimeType: item.mimeType || item.mime_type,
        thumbnailUrl: item.thumbnailUrl || item.thumbnail_url || null
      } as MediaDraft;
    })
    .filter(Boolean) as MediaDraft[];
};

const MyPosts: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const [posts, setPosts] = useState<any[]>([]);
  const [scrolls, setScrolls] = useState<ScrollVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | 'posts' | 'scrolls'>('all');
  const [filter, setFilter] = useState<'all' | 'original' | 'reposts' | 'with-media' | 'highlighted'>('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const HIGHLIGHT_LIMIT = 3;
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteScrollId, setDeleteScrollId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [replaceLocalId, setReplaceLocalId] = useState<string | null>(null);
  const [editingScroll, setEditingScroll] = useState<ScrollVideo | null>(null);
  const [scrollModalOpen, setScrollModalOpen] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setPosts([]);
      setScrolls([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [postsData, scrollsData] = await Promise.all([
        CommunityService.getMyPosts({ limit: 100, status: 'active' }).catch((err) => {
          throw err;
        }),
        ScrollService.getMine({ limit: 100 }).catch(() => ({ items: [] as ScrollVideo[] }))
      ]);
      setPosts(Array.isArray(postsData) ? postsData : []);
      const scrollItems = Array.isArray(scrollsData?.items) ? scrollsData.items : [];
      setScrolls(scrollItems);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load your content');
      setPosts([]);
      setScrolls([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    const events = [
      'community:post_created',
      'community:post_updated',
      'community:post_deleted',
      'scroll:created',
      'scroll:updated',
      'scroll:removed'
    ];
    events.forEach((eventName) => window.addEventListener(eventName, refresh as EventListener));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, refresh as EventListener));
    };
  }, [load]);

  const highlightedCount = useMemo(
    () => posts.filter((post) => Boolean(post.isHighlighted ?? post.is_highlighted)).length,
    [posts]
  );

  const filteredPosts = useMemo(() => {
    if (kindFilter === 'scrolls') return [];
    const term = query.trim().toLowerCase();
    return posts.filter((post) => {
      const isRepost = Boolean(post.originalPostId || post.originalPost);
      const hasMedia = Array.isArray(post.attachments) && post.attachments.length > 0;
      const isHighlighted = Boolean(post.isHighlighted ?? post.is_highlighted);
      if (filter === 'original' && isRepost) return false;
      if (filter === 'reposts' && !isRepost) return false;
      if (filter === 'with-media' && !hasMedia) return false;
      if (filter === 'highlighted' && !isHighlighted) return false;
      if (!term) return true;
      const hay = `${post.title || ''} ${post.content || ''} ${(post.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(term);
    });
  }, [filter, kindFilter, posts, query]);

  const filteredScrolls = useMemo(() => {
    if (kindFilter === 'posts') return [];
    if (filter === 'reposts' || filter === 'highlighted') return [];
    const term = query.trim().toLowerCase();
    return scrolls.filter((scroll) => {
      if (!term) return true;
      const hay = `${scroll.title || ''} ${scroll.description || ''} ${scroll.location || ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [filter, kindFilter, query, scrolls]);

  const beginEdit = (post: any) => {
    setEditingId(post.id);
    setDraft({
      title: String(post.title || ''),
      content: String(post.content || ''),
      topic: String(post.topic || ''),
      location: String(post.location || ''),
      visibility: String(post.visibility || 'public'),
      commentPolicy: String(post.commentPolicy || 'everyone'),
      graphicWarning: Boolean(post.graphicWarning),
      isAIEnhanced: Boolean(post.isAIEnhanced),
      aiInsightPreference: resolveStoredPostAiInsightPreference(post.aiInsightEnabled),
      media: mapAttachments(post)
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setReplaceLocalId(null);
  };

  const uploadMedia = async (file: File, replaceId?: string | null) => {
    if (!user || !draft) return;
    const localId = replaceId || `mp-media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const previewUrl = URL.createObjectURL(file);
    const mime = String(file.type || '').toLowerCase();
    const type: MediaDraft['type'] = mime.startsWith('video/')
      ? 'video'
      : mime.startsWith('image/')
        ? 'image'
        : 'document';

    setDraft((prev) => {
      if (!prev) return prev;
      const nextItem: MediaDraft = {
        localId,
        url: previewUrl,
        name: file.name,
        type,
        uploading: true,
        progress: 0
      };
      if (replaceId) {
        return {
          ...prev,
          media: prev.media.map((item) => (item.localId === replaceId ? nextItem : item))
        };
      }
      return { ...prev, media: [...prev.media, nextItem] };
    });

    try {
      const uploaded = await FileService.uploadFile(file, 'community', {
        role: user.role,
        visibility: draft.visibility === 'private' ? 'private' : 'public',
        userId: user.id,
        onProgress: (percent) => {
          setDraft((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              media: prev.media.map((item) =>
                item.localId === localId ? { ...item, progress: percent, uploading: true } : item
              )
            };
          });
        }
      });
      setDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          media: prev.media.map((item) =>
            item.localId === localId
              ? {
                  ...item,
                  id: uploaded.id,
                  url: uploaded.url || previewUrl,
                  type:
                    uploaded.type === 'video'
                      ? 'video'
                      : uploaded.type === 'image'
                        ? 'image'
                        : type,
                  mimeType: uploaded.mimeType || uploaded.mime_type,
                  thumbnailUrl: uploaded.thumbnailUrl || null,
                  uploading: false,
                  progress: 100,
                  error: undefined
                }
              : item
          )
        };
      });
      showNotification('success', 'My Posts', replaceId ? 'Media replaced.' : 'Media added.');
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Upload failed';
      setDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          media: prev.media.map((item) =>
            item.localId === localId ? { ...item, uploading: false, error: message } : item
          )
        };
      });
      showNotification('error', 'My Posts', message);
    }
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    if (draft.media.some((m) => m.uploading)) {
      showNotification('warning', 'My Posts', 'Wait for uploads to finish.');
      return;
    }
    const attachmentFileIds = draft.media.map((m) => m.id).filter(Boolean) as string[];
    if (!draft.content.trim() && !draft.title.trim() && attachmentFileIds.length === 0) {
      showNotification('warning', 'My Posts', 'Add text or at least one attachment.');
      return;
    }
    setBusyId(editingId);
    try {
      const updated = await CommunityService.updatePost(editingId, {
        title: draft.title.trim(),
        content: draft.content,
        attachmentFileIds,
        attachments: attachmentFileIds,
        topic: draft.topic || undefined,
        location: draft.location || undefined,
        visibility: draft.visibility,
        commentPolicy: draft.commentPolicy,
        graphicWarning: draft.graphicWarning,
        isAIEnhanced: draft.isAIEnhanced,
        aiInsightEnabled: postAiInsightPreferenceToBoolean(
          resolvePostAiInsightPreference(draft.aiInsightPreference, 'off')
        )
      });
      setPosts((prev) => prev.map((post) => (post.id === editingId ? { ...post, ...updated } : post)));
      cancelEdit();
      showNotification('success', 'My Posts', 'Post updated.');
      window.dispatchEvent(new CustomEvent('community:post_updated', { detail: { postId: editingId } }));
    } catch (err: any) {
      showNotification('error', 'My Posts', err?.response?.data?.error || err?.message || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setBusyId(deleteId);
    try {
      await CommunityService.deletePost(deleteId);
      setPosts((prev) => prev.filter((post) => post.id !== deleteId));
      if (editingId === deleteId) cancelEdit();
      showNotification('success', 'My Posts', 'Post deleted.');
      window.dispatchEvent(new CustomEvent('community:post_deleted', { detail: { postId: deleteId } }));
    } catch (err: any) {
      showNotification('error', 'My Posts', err?.response?.data?.error || err?.message || 'Delete failed');
    } finally {
      setBusyId(null);
      setDeleteId(null);
    }
  };

  const confirmDeleteScroll = async () => {
    if (!deleteScrollId) return;
    setBusyId(deleteScrollId);
    try {
      await ScrollService.remove(deleteScrollId);
      setScrolls((prev) => prev.filter((item) => item.id !== deleteScrollId));
      showNotification('success', 'My Scrolls', 'Scroll video deleted.');
      window.dispatchEvent(new CustomEvent('scroll:removed', { detail: { scrollId: deleteScrollId } }));
    } catch (err: any) {
      showNotification('error', 'My Scrolls', err?.response?.data?.error || err?.message || 'Delete failed');
    } finally {
      setBusyId(null);
      setDeleteScrollId(null);
    }
  };

  const openScrollEdit = (scroll: ScrollVideo) => {
    setEditingScroll(scroll);
    setScrollModalOpen(true);
  };

  const handleScrollUpdated = (scroll: ScrollVideo) => {
    setScrolls((prev) => prev.map((item) => (item.id === scroll.id ? { ...item, ...scroll } : item)));
    setScrollModalOpen(false);
    setEditingScroll(null);
    showNotification('success', 'My Scrolls', 'Scroll video updated.');
    window.dispatchEvent(new CustomEvent('scroll:updated', { detail: { scroll } }));
  };

  const copyScrollLink = async (scrollId: string) => {
    const url = `${window.location.origin}/scroll?scroll=${encodeURIComponent(scrollId)}`;
    try {
      await navigator.clipboard.writeText(url);
      showNotification('success', 'My Scrolls', 'Link copied.');
    } catch {
      showNotification('info', 'My Scrolls', url);
    }
  };

  const togglePin = async (post: any) => {
    setBusyId(post.id);
    try {
      const nextPinned = !Boolean(post.isPinned);
      const updated = await CommunityService.updatePost(post.id, { isPinned: nextPinned });
      setPosts((prev) =>
        prev.map((item) =>
          item.id === post.id
            ? { ...item, ...updated, isPinned: updated?.isPinned ?? nextPinned }
            : item
        )
      );
      showNotification(
        'success',
        'My Posts',
        (updated?.isPinned ?? nextPinned) ? 'Pinned to profile.' : 'Unpinned from profile.'
      );
      window.dispatchEvent(new CustomEvent('community:post_updated', { detail: { postId: post.id } }));
    } catch (err: any) {
      showNotification('error', 'My Posts', err?.response?.data?.error || err?.message || 'Pin failed');
    } finally {
      setBusyId(null);
    }
  };

  const toggleHighlight = async (post: any) => {
    const currentlyHighlighted = Boolean(post.isHighlighted ?? post.is_highlighted);
    if (!currentlyHighlighted && highlightedCount >= HIGHLIGHT_LIMIT) {
      showNotification(
        'warning',
        'Highlight limit',
        `You can highlight up to ${HIGHLIGHT_LIMIT} posts on your profile. Remove a highlight first.`
      );
      return;
    }
    setBusyId(post.id);
    try {
      const next = !currentlyHighlighted;
      const updated = await CommunityService.updatePost(post.id, { isHighlighted: next });
      setPosts((prev) =>
        prev.map((item) =>
          item.id === post.id
            ? {
                ...item,
                ...updated,
                isHighlighted: updated?.isHighlighted ?? updated?.is_highlighted ?? next
              }
            : item
        )
      );
      showNotification(
        'success',
        'Highlight',
        next ? 'Post highlighted on your profile.' : 'Highlight removed from profile.'
      );
      window.dispatchEvent(new CustomEvent('community:post_updated', { detail: { postId: post.id } }));
    } catch (err: any) {
      showNotification(
        'error',
        'Highlight',
        err?.response?.data?.error || err?.message || 'Unable to update highlight.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const actionBtnClass =
    'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-[36px] sm:py-1.5';

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Content inventory</p>
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">My Posts & Scrolls</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
              Manage community posts and Scroll videos in one place: edit, replace media, pin, highlight, delete.
              Highlights (posts) appear on your profile (max {HIGHLIGHT_LIMIT}).
            </p>
            <p className="mt-2 text-[11px] font-medium text-slate-500">
              Posts {posts.length} · Scrolls {scrolls.length} · Highlights {highlightedCount}/{HIGHLIGHT_LIMIT}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <Link
              to="/scroll?create=1"
              className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-100"
            >
              <Clapperboard className="h-3.5 w-3.5" />
              New Scroll
            </Link>
            <Link
              to="/home"
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              New post
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {(
              [
                ['all', `All (${posts.length + scrolls.length})`],
                ['posts', `Posts (${posts.length})`],
                ['scrolls', `Scrolls (${scrolls.length})`]
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setKindFilter(id)}
                className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold sm:py-1.5 ${
                  kindFilter === id
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {(
              [
                ['all', 'All'],
                ['original', 'Original'],
                ['reposts', 'Reposts'],
                ['with-media', 'With media'],
                ['highlighted', 'Highlighted']
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                disabled={kindFilter === 'scrolls' && id !== 'all' && id !== 'with-media'}
                className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold sm:py-1.5 disabled:opacity-40 ${
                  filter === id
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
                {id === 'highlighted' ? ` (${highlightedCount})` : ''}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title or body…"
            className="w-full min-w-0 flex-1 rounded-full border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400 sm:min-w-[12rem] sm:py-1.5 sm:text-xs"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton type="card" rows={3} />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : filteredPosts.length === 0 && filteredScrolls.length === 0 ? (
        <EmptyState
          title="No content yet"
          description="Publish a post on Member Home or create a Scroll video, then manage everything here."
        />
      ) : (
        <div className="space-y-4">
          {filteredScrolls.map((scroll) => {
            const busy = busyId === scroll.id;
            const mediaUrl =
              resolvePostAttachmentMediaUrl(scroll.media) ||
              String(scroll.media?.url || '').trim() ||
              '';
            const poster = String(scroll.media?.thumbnailUrl || '').trim();
            return (
              <article
                key={`scroll-${scroll.id}`}
                className="rounded-2xl border border-cyan-100 bg-white p-3 shadow-sm ring-1 ring-cyan-50 sm:p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-800">
                        <Clapperboard className="h-3 w-3" />
                        Scroll
                      </span>
                      <h3 className="truncate text-sm font-semibold text-slate-900">
                        {scroll.title || 'Untitled Scroll'}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                        {String(scroll.visibility || 'public')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {scroll.createdAt ? new Date(scroll.createdAt).toLocaleString() : '—'}
                      {scroll.location ? ` · ${scroll.location}` : ''}
                    </p>
                    {scroll.description ? (
                      <p className="mt-2 line-clamp-2 text-sm text-slate-700">{scroll.description}</p>
                    ) : null}
                  </div>
                </div>
                {mediaUrl ? (
                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-black">
                    <video
                      src={mediaUrl}
                      poster={poster || undefined}
                      className="mx-auto max-h-64 w-full object-contain sm:max-h-72"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  </div>
                ) : null}
                <div
                  className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
                  role="group"
                  aria-label="Scroll actions"
                >
                  <button
                    type="button"
                    onClick={() => openScrollEdit(scroll)}
                    disabled={busy}
                    className={`${actionBtnClass} border-slate-200 text-slate-700 hover:bg-slate-50`}
                  >
                    <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Edit / update
                  </button>
                  <Link
                    to={`/scroll?scroll=${encodeURIComponent(scroll.id)}`}
                    className={`${actionBtnClass} border-slate-200 text-slate-700 hover:bg-slate-50`}
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Open Scroll
                  </Link>
                  <button
                    type="button"
                    onClick={() => void copyScrollLink(scroll.id)}
                    disabled={busy}
                    className={`${actionBtnClass} border-slate-200 text-slate-700 hover:bg-slate-50`}
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Copy link
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteScrollId(scroll.id)}
                    disabled={busy}
                    className={`${actionBtnClass} col-span-2 border-rose-200 text-rose-600 hover:bg-rose-50 sm:col-span-1`}
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
          {filteredPosts.map((post) => {
            const busy = busyId === post.id;
            const isEditing = editingId === post.id && draft;
            const attachments = Array.isArray(post.attachments) ? post.attachments : [];
            const isRepost = Boolean(post.originalPostId || post.originalPost);
            const isHighlighted = Boolean(post.isHighlighted ?? post.is_highlighted);
            return (
              <article
                key={post.id}
                className={`rounded-2xl border bg-white p-3 shadow-sm sm:p-4 ${
                  isHighlighted ? 'border-violet-200 ring-1 ring-violet-100' : 'border-slate-200'
                }`}
              >
                {isEditing && draft ? (
                  <div className="space-y-3">
                    <input
                      value={draft.title}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                      placeholder="Title (optional)"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <textarea
                      value={draft.content}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, content: event.target.value } : prev))}
                      rows={5}
                      placeholder="Post body"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        value={draft.topic}
                        onChange={(event) => setDraft((prev) => (prev ? { ...prev, topic: event.target.value } : prev))}
                        placeholder="Topic"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                      <input
                        value={draft.location}
                        onChange={(event) =>
                          setDraft((prev) => (prev ? { ...prev, location: event.target.value } : prev))
                        }
                        placeholder="Location"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <select
                        value={draft.visibility}
                        onChange={(event) =>
                          setDraft((prev) => (prev ? { ...prev, visibility: event.target.value } : prev))
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="public">Public</option>
                        <option value="network">Network</option>
                        <option value="friends">Friends</option>
                        <option value="private">Private</option>
                      </select>
                      <select
                        value={draft.commentPolicy}
                        onChange={(event) =>
                          setDraft((prev) => (prev ? { ...prev, commentPolicy: event.target.value } : prev))
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="everyone">Everyone can comment</option>
                        <option value="followers">Followers</option>
                        <option value="following">Following</option>
                        <option value="mutuals">Mutuals</option>
                        <option value="none">Comments off</option>
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={draft.graphicWarning}
                          onChange={(event) =>
                            setDraft((prev) =>
                              prev ? { ...prev, graphicWarning: event.target.checked } : prev
                            )
                          }
                        />
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        Graphic warning
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={draft.isAIEnhanced}
                          onChange={(event) =>
                            setDraft((prev) =>
                              prev ? { ...prev, isAIEnhanced: event.target.checked } : prev
                            )
                          }
                        />
                        AI-enhanced
                      </label>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Media</p>
                        <button
                          type="button"
                          onClick={() => {
                            setReplaceLocalId(null);
                            mediaInputRef.current?.click();
                          }}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                        >
                          Add media
                        </button>
                      </div>
                      {draft.media.length === 0 ? (
                        <p className="text-xs text-slate-500">No media. Add photo or video, or keep text-only.</p>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {draft.media.map((media) => (
                            <div
                              key={media.localId}
                              className="relative overflow-hidden rounded-xl border border-slate-200 bg-white"
                            >
                              <div className="absolute right-2 top-2 z-10 flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplaceLocalId(media.localId);
                                    mediaInputRef.current?.click();
                                  }}
                                  className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold shadow"
                                >
                                  Replace
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraft((prev) =>
                                      prev
                                        ? { ...prev, media: prev.media.filter((m) => m.localId !== media.localId) }
                                        : prev
                                    )
                                  }
                                  className="rounded-full bg-white p-1 shadow"
                                  aria-label="Remove"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              {media.uploading ? (
                                <div className="flex h-36 items-center justify-center text-xs font-semibold text-slate-600">
                                  Uploading… {Math.round(Number(media.progress || 0))}%
                                </div>
                              ) : media.error ? (
                                <div className="flex h-36 items-center justify-center p-3 text-center text-xs text-rose-600">
                                  {media.error}
                                </div>
                              ) : media.type === 'video' ? (
                                <InlineAutoplayVideo
                                  src={mediaSrc(media)}
                                  className="h-36 w-full object-cover"
                                  controls={false}
                                  loop
                                  eagerLoad
                                  autoplayEnabled
                                  showMuteToggle={false}
                                  loadingLabel={false}
                                />
                              ) : media.type === 'image' ? (
                                <OptimizedImage
                                  src={
                                    resolvePostAttachmentPosterUrl(media) || mediaSrc(media) || ''
                                  }
                                  fallbackSrc={mediaSrc(media)}
                                  alt={media.name || 'Media'}
                                  width={640}
                                  height={360}
                                  className="h-36 w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-36 items-center justify-center text-xs text-slate-500">
                                  <FileText className="mr-1 h-4 w-4" />
                                  {media.name || 'Document'}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEdit()}
                        disabled={busy || draft.media.some((m) => m.uploading)}
                        className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {busy ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-slate-900">
                            {post.title || (isRepost ? 'Repost' : 'Untitled post')}
                          </h3>
                          {post.isPinned ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                              <Pin className="h-3 w-3" />
                              Pinned
                            </span>
                          ) : null}
                          {isHighlighted ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-800">
                              <Sparkles className="h-3 w-3" />
                              Highlighted
                            </span>
                          ) : null}
                          {isRepost ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                              Repost
                            </span>
                          ) : null}
                          {attachments.some((a: any) => inferType(a) === 'video') ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                              <Video className="h-3 w-3" /> Video
                            </span>
                          ) : attachments.some((a: any) => inferType(a) === 'image') ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                              <ImageIcon className="h-3 w-3" /> Photo
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {post.createdAt ? new Date(post.createdAt).toLocaleString() : '—'} ·{' '}
                          {String(post.visibility || 'public')}
                        </p>
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-700">{post.content || '—'}</p>
                      </div>
                    </div>

                    {attachments.length > 0 ? (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {attachments.slice(0, 4).map((media: any, index: number) => {
                          const type = inferType(media);
                          const src = resolvePostAttachmentMediaUrl(media) || media.url || '';
                          return (
                            <div
                              key={media.id || index}
                              className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                            >
                              {type === 'video' ? (
                                <video
                                  src={src}
                                  className="h-40 w-full object-cover sm:h-28"
                                  controls
                                  playsInline
                                  preload="metadata"
                                />
                              ) : type === 'image' ? (
                                <img
                                  src={resolvePostAttachmentPosterUrl(media) || src}
                                  alt=""
                                  className="h-40 w-full object-cover sm:h-28"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-28 items-center justify-center text-xs text-slate-500">
                                  {media.name || 'Attachment'}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    <div
                      className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
                      role="group"
                      aria-label="Post actions"
                    >
                      <button
                        type="button"
                        onClick={() => beginEdit(post)}
                        disabled={busy}
                        className={`${actionBtnClass} border-slate-200 text-slate-700 hover:bg-slate-50`}
                      >
                        <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void togglePin(post)}
                        disabled={busy}
                        className={`${actionBtnClass} ${
                          post.isPinned
                            ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                        aria-pressed={Boolean(post.isPinned)}
                      >
                        <Pin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{post.isPinned ? 'Unpin' : 'Pin'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleHighlight(post)}
                        disabled={busy || (!isHighlighted && highlightedCount >= HIGHLIGHT_LIMIT)}
                        title={
                          !isHighlighted && highlightedCount >= HIGHLIGHT_LIMIT
                            ? `Limit reached (${HIGHLIGHT_LIMIT}). Remove another highlight first.`
                            : isHighlighted
                              ? 'Remove highlight from profile'
                              : 'Highlight this post on your profile'
                        }
                        className={`${actionBtnClass} ${
                          isHighlighted
                            ? 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                        aria-pressed={isHighlighted}
                      >
                        <Heart
                          className={`h-3.5 w-3.5 shrink-0 ${isHighlighted ? 'fill-violet-600 text-violet-700' : ''}`}
                          aria-hidden
                        />
                        <span className="truncate">{isHighlighted ? 'Unhighlight' : 'Highlight'}</span>
                      </button>
                      <Link
                        to={`/post/${encodeURIComponent(post.id)}`}
                        className={`${actionBtnClass} border-slate-200 text-slate-700 hover:bg-slate-50`}
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteId(post.id)}
                        disabled={busy}
                        className={`${actionBtnClass} col-span-2 border-rose-200 text-rose-600 hover:bg-rose-50 sm:col-span-1`}
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}

      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadMedia(file, replaceLocalId);
          setReplaceLocalId(null);
          event.target.value = '';
        }}
      />

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete post?"
        description="This permanently removes the post from your profile and feeds. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmModal
        open={Boolean(deleteScrollId)}
        title="Delete Scroll video?"
        description="This permanently removes the Scroll from feeds and your inventory. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => void confirmDeleteScroll()}
        onCancel={() => setDeleteScrollId(null)}
      />
      <ScrollCreateModal
        open={scrollModalOpen}
        onClose={() => {
          setScrollModalOpen(false);
          setEditingScroll(null);
        }}
        onCreated={() => {
          setScrollModalOpen(false);
          setEditingScroll(null);
          void load();
        }}
        onUpdated={handleScrollUpdated}
        editScroll={editingScroll}
      />
    </div>
  );
};

export default MyPosts;
