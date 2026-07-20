import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Video,
  X
} from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { CommunityService } from '../../services/community';
import { FileService } from '../../services/files';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'original' | 'reposts' | 'with-media'>('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [replaceLocalId, setReplaceLocalId] = useState<string | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await CommunityService.getMyPosts({ limit: 100, status: 'active' });
      setPosts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load your posts');
      setPosts([]);
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
    const events = ['community:post_created', 'community:post_updated', 'community:post_deleted'];
    events.forEach((eventName) => window.addEventListener(eventName, refresh as EventListener));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, refresh as EventListener));
    };
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return posts.filter((post) => {
      const isRepost = Boolean(post.originalPostId || post.originalPost);
      const hasMedia = Array.isArray(post.attachments) && post.attachments.length > 0;
      if (filter === 'original' && isRepost) return false;
      if (filter === 'reposts' && !isRepost) return false;
      if (filter === 'with-media' && !hasMedia) return false;
      if (!term) return true;
      const hay = `${post.title || ''} ${post.content || ''} ${(post.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(term);
    });
  }, [filter, posts, query]);

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

  const togglePin = async (post: any) => {
    setBusyId(post.id);
    try {
      const updated = await CommunityService.updatePost(post.id, { isPinned: !post.isPinned });
      setPosts((prev) => prev.map((item) => (item.id === post.id ? { ...item, ...updated } : item)));
      showNotification('success', 'My Posts', updated?.isPinned ? 'Pinned to profile.' : 'Unpinned.');
    } catch (err: any) {
      showNotification('error', 'My Posts', err?.response?.data?.error || err?.message || 'Pin failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Content inventory</p>
            <h2 className="text-xl font-bold text-slate-900">My Posts</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              View, edit, replace media, pin, and delete your community posts in one place. Changes apply in real time
              across member home and your profile.
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
              to="/home"
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Create on Member Home
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(
            [
              ['all', 'All'],
              ['original', 'Original'],
              ['reposts', 'Reposts'],
              ['with-media', 'With media']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                filter === id ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title or body…"
            className="ml-auto min-w-[12rem] flex-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton type="card" rows={3} />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No posts yet"
          description="Publish from Member Home, then manage every post, video, and attachment here."
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((post) => {
            const busy = busyId === post.id;
            const isEditing = editingId === post.id && draft;
            const attachments = Array.isArray(post.attachments) ? post.attachments : [];
            const isRepost = Boolean(post.originalPostId || post.originalPost);
            return (
              <article key={post.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                              Pinned
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
                        <p className="mt-2 line-clamp-3 text-sm text-slate-700">{post.content || '—'}</p>
                      </div>
                    </div>

                    {attachments.length > 0 ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {attachments.slice(0, 4).map((media: any, index: number) => {
                          const type = inferType(media);
                          const src = resolvePostAttachmentMediaUrl(media) || media.url || '';
                          return (
                            <div
                              key={media.id || index}
                              className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                            >
                              {type === 'video' ? (
                                <video src={src} className="h-28 w-full object-cover" controls playsInline />
                              ) : type === 'image' ? (
                                <img
                                  src={resolvePostAttachmentPosterUrl(media) || src}
                                  alt=""
                                  className="h-28 w-full object-cover"
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

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => beginEdit(post)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void togglePin(post)}
                        disabled={busy}
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {post.isPinned ? 'Unpin' : 'Pin to profile'}
                      </button>
                      <Link
                        to={`/post/${encodeURIComponent(post.id)}`}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteId(post.id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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
    </div>
  );
};

export default MyPosts;
