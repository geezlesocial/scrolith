import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Edit3, Heart, MessageCircle, Send, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';
import { CommunityService } from '../services/community';
import { ReactionsService } from '../services/reactions';
import ReactionBar from '../community/components/ReactionBar';
import MentionText from '../community/components/MentionText';

type CommentAuthor = {
  id?: string;
  name?: string;
  username?: string;
  avatar?: string | null;
};

type PostComment = {
  id: string;
  postId: string;
  parentId: string | null;
  userId?: string;
  userName?: string;
  userUsername?: string | null;
  userAvatar?: string | null;
  author?: CommentAuthor;
  content?: string;
  attachments?: { id?: string; url: string; name?: string; type?: string; mimeType?: string }[];
  status?: 'active' | 'deleted' | string;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  likesCount?: number;
  likedByMe?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  replies?: PostComment[];
};

type CommentPolicy = 'everyone' | 'followers' | 'following' | 'mutuals' | 'none';

type PostCommentsProps = {
  postId: string;
  authorId?: string;
  commentPolicy?: string | null;
  initialCount?: number;
  focusCommentId?: string;
  focusMentionToken?: string;
  onCountChange?: (postId: string, count: number) => void;
};

const policyLabels: Record<CommentPolicy, string> = {
  everyone: 'Everyone can comment',
  followers: 'Followers can comment',
  following: 'People the author follows can comment',
  mutuals: 'Mutual followers can comment',
  none: 'Comments are disabled'
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

const normalizeCount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
};

const countActiveComments = (items: PostComment[]): number =>
  items.reduce((count, comment) => {
    const isActive = comment.status !== 'deleted';
    const replyCount = countActiveComments(comment.replies || []);
    return count + (isActive ? 1 : 0) + replyCount;
  }, 0);

const collectCommentIds = (items: PostComment[]): string[] =>
  items.flatMap((comment) => [
    comment.id,
    ...collectCommentIds(Array.isArray(comment.replies) ? comment.replies : [])
  ]);

const sumReactionTotals = (counts?: Record<string, number>) =>
  Object.values(counts || {}).reduce((total, value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return total;
    return total + Math.max(0, Math.trunc(numeric));
  }, 0);

const commentExists = (items: PostComment[], id: string): boolean =>
  items.some((comment) =>
    comment.id === id || (comment.replies ? commentExists(comment.replies, id) : false)
  );

const dedupeTopLevelComments = (items: PostComment[]): PostComment[] => {
  const seen = new Set<string>();
  return items.filter((comment) => {
    const id = String(comment?.id || '').trim();
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const resolveCommentProfileUrl = (comment: PostComment): string => {
  const username = String(comment.userUsername || comment.author?.username || '').trim().replace(/^@+/, '');
  if (username) return `/u/${username}`;
  const id = String(comment.userId || comment.author?.id || '').trim();
  if (id) return `/profile/${id}`;
  return '/profile/edit';
};

const insertComment = (items: PostComment[], comment: PostComment): PostComment[] => {
  if (!comment.parentId) return [...items, { ...comment, replies: comment.replies || [] }];
  return items.map((item) => {
    if (item.id === comment.parentId) {
      const replies = item.replies ? [...item.replies, comment] : [comment];
      return { ...item, replies };
    }
    if (item.replies?.length) {
      return { ...item, replies: insertComment(item.replies, comment) };
    }
    return item;
  });
};

const updateCommentInTree = (items: PostComment[], updated: Partial<PostComment> & { id: string }): PostComment[] =>
  items.map((item) => {
    if (item.id === updated.id) {
      return { ...item, ...updated, replies: item.replies || [] };
    }
    if (item.replies?.length) {
      return { ...item, replies: updateCommentInTree(item.replies, updated) };
    }
    return item;
  });

const markCommentDeleted = (items: PostComment[], commentId: string): { items: PostComment[]; wasActive: boolean } => {
  let wasActive = false;
  const nextItems = items.map((item) => {
    if (item.id === commentId) {
      wasActive = item.status !== 'deleted';
      return {
        ...item,
        status: 'deleted',
        deletedAt: new Date().toISOString(),
        content: '',
        attachments: []
      };
    }
    if (item.replies?.length) {
      const result = markCommentDeleted(item.replies, commentId);
      if (result.wasActive) wasActive = true;
      return { ...item, replies: result.items };
    }
    return item;
  });
  return { items: nextItems, wasActive };
};

const PostComments: React.FC<PostCommentsProps> = ({
  postId,
  authorId,
  commentPolicy,
  initialCount = 0,
  focusCommentId,
  focusMentionToken,
  onCountChange
}) => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [count, setCount] = useState(() => normalizeCount(initialCount));
  const [commentReactionSummary, setCommentReactionSummary] = useState<
    Record<string, { counts: Record<string, number>; userReaction: string | null }>
  >({});
  const onCountChangeRef = useRef<typeof onCountChange>(onCountChange);
  const initialCountRef = useRef<number>(normalizeCount(initialCount));
  const lastNotifiedCountRef = useRef<number>(normalizeCount(initialCount));
  const suppressNotifyRef = useRef(false);
  const commentsRef = useRef<PostComment[]>([]);
  const submitLockRef = useRef(false);
  const pendingCreatedIdsRef = useRef<Set<string>>(new Set());

  const policy = useMemo(() => String(commentPolicy || 'everyone').toLowerCase() as CommentPolicy, [commentPolicy]);
  const isAuthor = !!user?.id && !!authorId && String(user.id) === String(authorId);
  const commentsDisabled = policy === 'none' && !isAuthor;
  const policyLabel = policyLabels[policy] || policyLabels.everyone;
  const loadComments = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    try {
      const data = await CommunityService.getPostComments(postId, cursor ? { cursor } : undefined);
      const items = Array.isArray(data?.items) ? data.items : [];
      setComments((prev) => (cursor ? dedupeTopLevelComments([...prev, ...items]) : dedupeTopLevelComments(items)));
      setNextCursor(data?.nextCursor || null);
      if (!cursor) {
        const activeCount = normalizeCount(countActiveComments(items));
        setCount((prev) => (prev === activeCount ? prev : activeCount));
      }
    } catch (error: any) {
      console.error('Failed to load comments', error);
      if (!cursor) {
        setComments([]);
        setCount((prev) => (prev === initialCountRef.current ? prev : initialCountRef.current));
      }
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    const normalizedInitialCount = normalizeCount(initialCount);
    initialCountRef.current = normalizedInitialCount;
    setCount((prev) => {
      if (prev === normalizedInitialCount) return prev;
      suppressNotifyRef.current = true;
      return normalizedInitialCount;
    });
  }, [initialCount, postId]);

  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  useEffect(() => {
    if (suppressNotifyRef.current) {
      suppressNotifyRef.current = false;
      lastNotifiedCountRef.current = count;
      return;
    }
    if (!onCountChangeRef.current) return;
    if (count === lastNotifiedCountRef.current) return;
    lastNotifiedCountRef.current = count;
    onCountChangeRef.current(postId, count);
  }, [count, postId]);

  useEffect(() => {
    const id = String(focusCommentId || '').trim();
    if (!id) return;
    if (loading) return;

    const target = document.getElementById(`comment-${id}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('ring-2', 'ring-blue-300', 'bg-blue-50/30');
      const timer = window.setTimeout(() => {
        target.classList.remove('ring-2', 'ring-blue-300', 'bg-blue-50/30');
      }, 3500);
      return () => window.clearTimeout(timer);
    }

    if (nextCursor) {
      void loadComments(nextCursor);
    }
  }, [focusCommentId, loading, nextCursor, loadComments]);

  const formatTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  };

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const checkAuth = () => {
    if (!user) {
      if (confirm('Log in to comment on Scrolith posts. Go to login?')) {
        window.location.href = '/auth/login';
      }
      return false;
    }
    return true;
  };

  const commentIds = useMemo(() => collectCommentIds(comments), [comments]);

  useEffect(() => {
    if (!commentIds.length) {
      setCommentReactionSummary({});
      return;
    }
    let active = true;
    ReactionsService.getSummaryBulk('COMMENT', commentIds)
      .then((response) => {
        if (!active) return;
        const normalized: Record<string, { counts: Record<string, number>; userReaction: string | null }> = {};
        commentIds.forEach((commentId) => {
          const row = response?.[commentId];
          normalized[commentId] = {
            counts: row?.counts || {},
            userReaction: row?.userReaction || null
          };
        });
        setCommentReactionSummary(normalized);
      })
      .catch((error) => {
        const status = Number(error?.response?.status || 0);
        if (status !== 401 && status !== 403 && status !== 404) {
          console.warn('Failed to load comment reaction summaries', error);
        }
      });
    return () => {
      active = false;
    };
  }, [commentIds]);

  const handleSubmit = async (parentId?: string | null) => {
    if (submitLockRef.current) return;
    if (!checkAuth()) return;
    if (commentsDisabled) {
      showNotification('warning', 'Comments', 'Comments are disabled for this post.');
      return;
    }
    const text = (parentId ? replyDraft : draft).trim();
    if (!text) {
      showNotification('warning', 'Comments', 'Please enter a comment.');
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const created = await CommunityService.commentOnPost(postId, { content: text, parentId: parentId || null });
      if (created?.id) {
        const prepared = { ...created, replies: created.replies || [] };
        const shouldIncrease = created.status !== 'deleted' && !commentExists(commentsRef.current, created.id);
        pendingCreatedIdsRef.current.add(String(created.id));
        setComments((prev) => {
          if (commentExists(prev, created.id)) {
            return updateCommentInTree(prev, prepared);
          }
          return insertComment(prev, prepared);
        });
        if (shouldIncrease) {
          setCount((prev) => prev + 1);
        }
      }
      if (parentId) {
        setReplyDraft('');
        setReplyToId(null);
      } else {
        setDraft('');
      }
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Unable to comment.';
      showNotification('error', 'Comments', message);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    const text = editDraft.trim();
    if (!text) {
      showNotification('warning', 'Comments', 'Content is required.');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await CommunityService.updatePostComment(editingId, { content: text });
      if (updated?.id) {
        setComments((prev) => updateCommentInTree(prev, updated));
      }
      setEditingId(null);
      setEditDraft('');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Unable to update.';
      showNotification('error', 'Comments', message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!checkAuth()) return;
    if (!confirm('Delete this comment?')) return;
    setSubmitting(true);
    try {
      await CommunityService.deletePostComment(commentId);
      setComments((prev) => {
        const result = markCommentDeleted(prev, commentId);
        if (result.wasActive) {
          setCount((count) => Math.max(0, count - 1));
        }
        return result.items;
      });
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Unable to delete.';
      showNotification('error', 'Comments', message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (comment: PostComment) => {
    if (!checkAuth()) return;
    if (comment.status === 'deleted') return;
    const optimisticLiked = !comment.likedByMe;
    const nextLikes = (comment.likesCount || 0) + (optimisticLiked ? 1 : -1);
    setComments((prev) => updateCommentInTree(prev, { id: comment.id, likedByMe: optimisticLiked, likesCount: nextLikes }));
    try {
      const response = await CommunityService.togglePostCommentLike(comment.id);
      if (response?.commentId) {
        const likedByMe = response.userId === user?.id ? response.liked : optimisticLiked;
        setComments((prev) =>
          updateCommentInTree(prev, {
            id: response.commentId,
            likesCount: response.likesCount ?? nextLikes,
            likedByMe
          })
        );
      }
    } catch (error: any) {
      console.error(error);
      setComments((prev) => updateCommentInTree(prev, { id: comment.id, likedByMe: !optimisticLiked, likesCount: comment.likesCount }));
    }
  };

  const onCommentCreated = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail || detail.postId !== postId) return;
    const incoming: PostComment = detail.comment || detail;
    const incomingId = String(incoming?.id || '').trim();
    const isLocalEcho = !!incomingId && pendingCreatedIdsRef.current.has(incomingId);
    if (isLocalEcho) {
      pendingCreatedIdsRef.current.delete(incomingId);
    }
    const shouldIncrease = !isLocalEcho && incoming.status !== 'deleted' && !!incomingId && !commentExists(commentsRef.current, incomingId);
    setComments((prev) => {
      if (!incomingId) return prev;
      if (commentExists(prev, incomingId)) {
        return updateCommentInTree(prev, { ...incoming, replies: incoming.replies || [] });
      }
      return insertComment(prev, { ...incoming, replies: incoming.replies || [] });
    });
    if (shouldIncrease) {
      setCount((prev) => prev + 1);
    }
  }, [postId]);

  const onCommentUpdated = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail || detail.postId !== postId) return;
    const incoming: PostComment = detail.comment || detail;
    setComments((prev) => updateCommentInTree(prev, incoming));
  }, [postId]);

  const onCommentDeleted = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail || detail.postId !== postId) return;
    const commentId = detail.commentId;
    if (!commentId) return;
    setComments((prev) => {
      const result = markCommentDeleted(prev, commentId);
      if (result.wasActive) {
        setCount((count) => Math.max(0, count - 1));
      }
      return result.items;
    });
  }, [postId]);

  const onCommentLikeToggled = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail || detail.postId !== postId) return;
    const { commentId, likesCount, userId, liked } = detail;
    if (!commentId) return;
    setComments((prev) =>
      updateCommentInTree(prev, {
        id: commentId,
        likesCount,
        likedByMe: user?.id && userId === user.id ? liked : undefined
      })
    );
  }, [postId, user?.id]);

  const onCommentReactionUpdated = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail || {};
    if (String(detail.targetType || '').toUpperCase() !== 'COMMENT') return;
    const commentId = String(detail.targetId || '').trim();
    if (!commentId) return;
    setCommentReactionSummary((prev) => {
      const existing = prev[commentId] || { counts: {}, userReaction: null };
      const actorMatchesViewer = !!(detail.actorUserId && user?.id && String(detail.actorUserId) === String(user.id));
      return {
        ...prev,
        [commentId]: {
          counts: detail.counts || {},
          userReaction: actorMatchesViewer ? detail.userReaction || null : existing.userReaction
        }
      };
    });
  }, [user?.id]);

  useEffect(() => {
    window.addEventListener('community:post_comment_created', onCommentCreated as EventListener);
    window.addEventListener('community:post_comment_updated', onCommentUpdated as EventListener);
    window.addEventListener('community:post_comment_deleted', onCommentDeleted as EventListener);
    window.addEventListener('community:post_comment_like_toggled', onCommentLikeToggled as EventListener);
    window.addEventListener('reactions:updated', onCommentReactionUpdated as EventListener);
    return () => {
      window.removeEventListener('community:post_comment_created', onCommentCreated as EventListener);
      window.removeEventListener('community:post_comment_updated', onCommentUpdated as EventListener);
      window.removeEventListener('community:post_comment_deleted', onCommentDeleted as EventListener);
      window.removeEventListener('community:post_comment_like_toggled', onCommentLikeToggled as EventListener);
      window.removeEventListener('reactions:updated', onCommentReactionUpdated as EventListener);
    };
  }, [onCommentCreated, onCommentUpdated, onCommentDeleted, onCommentLikeToggled, onCommentReactionUpdated]);

  const renderAttachments = (attachments?: PostComment['attachments']) => {
    if (!attachments?.length) return null;
    return (
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {attachments.map((media) => {
          const type = inferMediaType(media || {});
          if (type === 'video') {
            return (
              <div key={media.id || media.url} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <video src={media.url} controls className="h-36 w-full object-cover" />
              </div>
            );
          }
          if (type === 'image') {
            return (
              <div key={media.id || media.url} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img src={media.url} alt={media.name || 'Attachment'} className="h-36 w-full object-cover" />
              </div>
            );
          }
          return (
            <div key={media.id || media.url} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <a href={media.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                {media.name || media.url?.split('/').pop() || 'View attachment'}
              </a>
            </div>
          );
        })}
      </div>
    );
  };

  const renderComment = (comment: PostComment, depth = 0) => {
    const isDeleted = comment.status === 'deleted';
    const canEdit = comment.canEdit && !isDeleted;
    const canDelete = comment.canDelete && !isDeleted;
    const isEditing = editingId === comment.id;
    const reactionSummary = commentReactionSummary[comment.id];
    const reactionCount = sumReactionTotals(reactionSummary?.counts);
    const replyCount = countActiveComments(comment.replies || []);
    const commentProfileUrl = resolveCommentProfileUrl(comment);
    const commentAuthorName = comment.userName || comment.author?.name || 'Community member';
    return (
      <div
        key={comment.id}
        id={`comment-${comment.id}`}
        className={`mt-4 rounded-xl transition-colors ${depth > 0 ? 'ml-6 border-l border-slate-100 pl-4' : ''}`}
      >
        <div className="flex items-start gap-3">
          <Link to={commentProfileUrl} className="h-9 w-9 rounded-full bg-slate-100 overflow-hidden">
            {comment.userAvatar ? (
              <img src={comment.userAvatar} alt={commentAuthorName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-500">
                {commentAuthorName.slice(0, 1)}
              </div>
            )}
          </Link>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link to={commentProfileUrl} className="font-semibold text-slate-900 hover:text-slate-700 hover:underline">
                {commentAuthorName}
              </Link>
              {comment.createdAt && (
                <span className="text-xs text-slate-500">{formatTime(comment.createdAt)}</span>
              )}
              {comment.updatedAt && comment.updatedAt !== comment.createdAt && !isDeleted && (
                <span className="text-[10px] text-slate-400">Edited</span>
              )}
            </div>

            {isEditing ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={editDraft}
                  onChange={(event) => setEditDraft(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 p-3 text-sm text-slate-700"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEditDraft('');
                    }}
                    className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleEditSave}
                    disabled={submitting}
                    className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase text-white disabled:opacity-60"
                  >
                    {submitting ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className={`mt-2 text-sm ${isDeleted ? 'italic text-slate-400' : 'text-slate-700'}`}>
                  {isDeleted ? (
                    'This comment has been deleted.'
                  ) : (
                    <MentionText
                      text={comment.content}
                      mentionToken={focusMentionToken}
                      viewerId={user?.id}
                      viewerUsername={user?.username}
                    />
                  )}
                </p>
                {!isDeleted && renderAttachments(comment.attachments)}
              </>
            )}

            {!isEditing && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <button
                  type="button"
                  onClick={() => handleLike(comment)}
                  className={`inline-flex items-center gap-1 hover:text-red-500 ${comment.likedByMe ? 'text-red-500' : ''}`}
                >
                  <Heart className={`h-3.5 w-3.5 ${comment.likedByMe ? 'fill-current' : ''}`} />
                  {comment.likesCount || 0}
                </button>
                {!isDeleted && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!checkAuth()) return;
                      setReplyToId(comment.id);
                      setReplyDraft('');
                    }}
                    className="inline-flex items-center gap-1 hover:text-blue-500"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Reply
                  </button>
                )}
                {!isDeleted && (
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <span>{replyCount}</span>
                    <span>replies</span>
                  </span>
                )}
                {!isDeleted && (
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <span>{reactionCount}</span>
                    <span>reactions</span>
                  </span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(comment.id);
                      setEditDraft(comment.content || '');
                    }}
                    className="inline-flex items-center gap-1 hover:text-slate-700"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(comment.id)}
                    className="inline-flex items-center gap-1 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
            )}

            {!isDeleted ? (
              <ReactionBar
                targetType="COMMENT"
                targetId={comment.id}
                initialCounts={reactionSummary?.counts}
                initialUserReaction={reactionSummary?.userReaction}
                className="mt-2"
              />
            ) : null}

            {replyToId === comment.id && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={replyDraft}
                  onChange={(event) => setReplyDraft(event.target.value)}
                  placeholder="Write a reply..."
                  className="w-full rounded-2xl border border-slate-200 p-3 text-sm text-slate-700"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReplyToId(null);
                      setReplyDraft('');
                    }}
                    className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmit(comment.id)}
                    disabled={submitting}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase text-white disabled:opacity-60"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Reply
                  </button>
                </div>
              </div>
            )}

            {comment.replies?.map((reply) => renderComment(reply, depth + 1))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div id={`post-${postId}-comments`} className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-800">Comments ({count})</div>
        <span className="text-[11px] uppercase tracking-wide text-slate-400">{policyLabel}</span>
      </div>

      {!user && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
          Log in to comment on this post.
        </div>
      )}

      {user && (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={commentsDisabled ? 'Comments are disabled for this post.' : 'Write a comment...'}
            disabled={commentsDisabled || submitting}
            className="w-full rounded-2xl border border-slate-200 p-3 text-sm text-slate-700 disabled:bg-slate-100"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">{commentsDisabled ? 'Only the post author can comment.' : 'Be respectful and keep it constructive.'}</p>
            <button
              type="button"
              onClick={() => handleSubmit(null)}
              disabled={commentsDisabled || submitting}
              className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-[11px] font-semibold uppercase text-white disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              Comment
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <p className="text-xs text-slate-500">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-slate-500">No comments yet. Be the first to reply.</p>
        ) : (
          comments.map((comment) => renderComment(comment))
        )}
      </div>

      {nextCursor && !loading && (
        <button
          type="button"
          onClick={() => loadComments(nextCursor)}
          className="mt-4 rounded-full border border-slate-200 px-4 py-2 text-[11px] font-semibold uppercase text-slate-600"
        >
          Load more comments
        </button>
      )}
    </div>
  );
};

export default PostComments;
