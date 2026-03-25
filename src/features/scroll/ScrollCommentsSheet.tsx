import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Edit3, Loader2, MessageCircle, Send, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { ScrollService, type ScrollComment, type ScrollVideo } from '../../services/scroll';
import ReactionBar from '../../community/components/ReactionBar';
import MentionText from '../../community/components/MentionText';
import CommentAiAssist from '../../components/post/CommentAiAssist';

type ScrollCommentsSheetProps = {
  scroll: ScrollVideo | null;
  isOpen: boolean;
  onClose: () => void;
  onCountChange?: (scrollId: string, count: number) => void;
};

const countActiveComments = (items: ScrollComment[]): number =>
  items.reduce((count, comment) => {
    const isActive = String(comment.status || '').toLowerCase() !== 'deleted';
    return count + (isActive ? 1 : 0) + countActiveComments(Array.isArray(comment.replies) ? comment.replies : []);
  }, 0);

const commentExists = (items: ScrollComment[], id: string): boolean =>
  items.some((comment) => comment.id === id || commentExists(Array.isArray(comment.replies) ? comment.replies : [], id));

const insertComment = (items: ScrollComment[], comment: ScrollComment): ScrollComment[] => {
  if (!comment.parentId) return [...items, { ...comment, replies: Array.isArray(comment.replies) ? comment.replies : [] }];
  return items.map((item) => {
    if (item.id === comment.parentId) {
      const replies = Array.isArray(item.replies) ? [...item.replies, comment] : [comment];
      return { ...item, replies };
    }
    if (Array.isArray(item.replies) && item.replies.length) {
      return { ...item, replies: insertComment(item.replies, comment) };
    }
    return item;
  });
};

const updateCommentInTree = (
  items: ScrollComment[],
  updated: Partial<ScrollComment> & { id: string }
): ScrollComment[] =>
  items.map((item) => {
    if (item.id === updated.id) {
      return {
        ...item,
        ...updated,
        replies: Array.isArray(item.replies) ? item.replies : []
      };
    }
    if (Array.isArray(item.replies) && item.replies.length) {
      return { ...item, replies: updateCommentInTree(item.replies, updated) };
    }
    return item;
  });

const markCommentDeleted = (
  items: ScrollComment[],
  commentId: string
): { items: ScrollComment[]; wasActive: boolean } => {
  let wasActive = false;
  const nextItems = items.map((item) => {
    if (item.id === commentId) {
      wasActive = String(item.status || '').toLowerCase() !== 'deleted';
      return {
        ...item,
        status: 'deleted',
        deletedAt: new Date().toISOString(),
        content: ''
      };
    }
    if (Array.isArray(item.replies) && item.replies.length) {
      const result = markCommentDeleted(item.replies, commentId);
      if (result.wasActive) wasActive = true;
      return { ...item, replies: result.items };
    }
    return item;
  });
  return { items: nextItems, wasActive };
};

const sumReactionTotals = (counts?: Record<string, number>) =>
  Object.values(counts || {}).reduce((total, value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return total;
    return total + Math.max(0, Math.trunc(numeric));
  }, 0);

const resolveCommentProfileUrl = (comment: ScrollComment): string => {
  const username = String(comment.userUsername || '').trim().replace(/^@+/, '');
  if (username) return `/u/${username}`;
  const id = String(comment.userId || '').trim();
  if (id) return `/profile/${id}`;
  return '/profile/edit';
};

const resolveCommentAvatar = (comment: ScrollComment): string | null => {
  const avatar = String(comment.userAvatar || '').trim();
  return avatar || null;
};

const resolveCommentUsername = (comment: ScrollComment): string =>
  String(comment.userUsername || '').trim().replace(/^@+/, '');

const formatTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

const ScrollCommentsSheet: React.FC<ScrollCommentsSheetProps> = ({
  scroll,
  isOpen,
  onClose,
  onCountChange
}) => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const [comments, setComments] = useState<ScrollComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const draftRef = useRef<HTMLTextAreaElement | null>(null);

  const count = useMemo(() => countActiveComments(comments), [comments]);
  const scrollId = String(scroll?.id || '').trim();

  useEffect(() => {
    if (isOpen) return;
    setComments([]);
    setDraft('');
    setReplyToId(null);
    setReplyDraft('');
    setEditingId(null);
    setEditDraft('');
    setLoading(false);
    setSubmitting(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !scrollId) return;
    let active = true;
    setLoading(true);
    ScrollService.getComments(scrollId)
      .then((data) => {
        if (!active) return;
        setComments(Array.isArray(data?.items) ? data.items : []);
      })
      .catch((error: any) => {
        if (!active) return;
        setComments([]);
        const message = error?.response?.data?.error || error?.message || 'Failed to load scroll comments.';
        showNotification('error', 'Scroll', message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, scrollId, showNotification]);

  useEffect(() => {
    if (!isOpen || !scrollId || !onCountChange) return;
    onCountChange(scrollId, count);
  }, [count, isOpen, onCountChange, scrollId]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      try {
        draftRef.current?.focus();
      } catch {}
    }, 80);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !scrollId) return;

    const onCreated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.scrollId || '') !== scrollId) return;
      const comment = detail.comment as ScrollComment | undefined;
      if (!comment?.id) return;
      setComments((prev) => (commentExists(prev, comment.id) ? prev : insertComment(prev, comment)));
    };

    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.scrollId || '') !== scrollId) return;
      const comment = detail.comment as ScrollComment | undefined;
      if (!comment?.id) return;
      setComments((prev) => updateCommentInTree(prev, comment));
    };

    const onDeleted = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.scrollId || '') !== scrollId) return;
      const commentId = String(detail.commentId || '').trim();
      if (!commentId) return;
      setComments((prev) => markCommentDeleted(prev, commentId).items);
    };

    const onReactionUpdated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.targetType || '').toUpperCase() !== 'COMMENT') return;
      const targetId = String(detail.targetId || '').trim();
      if (!targetId || !commentExists(comments, targetId)) return;
      setComments((prev) =>
        updateCommentInTree(prev, {
          id: targetId,
          reactionSummary: {
            counts: detail.counts || {},
            userReaction: detail.userReaction || null
          }
        })
      );
    };

    window.addEventListener('scroll:comment_created', onCreated as EventListener);
    window.addEventListener('scroll:comment_updated', onUpdated as EventListener);
    window.addEventListener('scroll:comment_deleted', onDeleted as EventListener);
    window.addEventListener('reactions:updated', onReactionUpdated as EventListener);
    return () => {
      window.removeEventListener('scroll:comment_created', onCreated as EventListener);
      window.removeEventListener('scroll:comment_updated', onUpdated as EventListener);
      window.removeEventListener('scroll:comment_deleted', onDeleted as EventListener);
      window.removeEventListener('reactions:updated', onReactionUpdated as EventListener);
    };
  }, [comments, isOpen, scrollId]);

  const ensureAuth = useCallback(() => {
    if (user?.id) return true;
    if (window.confirm('Log in to comment on Scroll videos?')) window.location.href = '/auth/login';
    return false;
  }, [user?.id]);

  const submitComment = useCallback(
    async (parentId?: string | null) => {
      if (!scrollId || submitting) return;
      if (!ensureAuth()) return;

      const isReply = Boolean(parentId);
      const content = String(isReply ? replyDraft : draft).trim();
      if (!content) {
        showNotification('warning', 'Scroll', isReply ? 'Reply cannot be empty.' : 'Comment cannot be empty.');
        return;
      }

      setSubmitting(true);
      try {
        await ScrollService.createComment(scrollId, { content, parentId: parentId || null });
        if (isReply) {
          setReplyDraft('');
          setReplyToId(null);
        } else {
          setDraft('');
        }
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to comment on Scroll.';
        showNotification('error', 'Scroll', message);
      } finally {
        setSubmitting(false);
      }
    },
    [draft, ensureAuth, replyDraft, scrollId, showNotification, submitting]
  );

  const saveEdit = useCallback(async () => {
    if (!editingId || submitting) return;
    const content = String(editDraft || '').trim();
    if (!content) {
      showNotification('warning', 'Scroll', 'Comment cannot be empty.');
      return;
    }
    setSubmitting(true);
    try {
      await ScrollService.updateComment(editingId, { content });
      setEditingId(null);
      setEditDraft('');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to update comment.';
      showNotification('error', 'Scroll', message);
    } finally {
      setSubmitting(false);
    }
  }, [editDraft, editingId, showNotification, submitting]);

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (submitting) return;
      if (!window.confirm('Delete this comment?')) return;
      setSubmitting(true);
      try {
        await ScrollService.deleteComment(commentId);
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to delete comment.';
        showNotification('error', 'Scroll', message);
      } finally {
        setSubmitting(false);
      }
    },
    [showNotification, submitting]
  );

  const renderComment = (comment: ScrollComment, depth = 0): React.ReactNode => {
    const isDeleted = String(comment.status || '').toLowerCase() === 'deleted';
    const isEditing = editingId === comment.id;
    const replyCount = countActiveComments(Array.isArray(comment.replies) ? comment.replies : []);
    const reactionCount = sumReactionTotals(comment.reactionSummary?.counts);
    const profileUrl = resolveCommentProfileUrl(comment);
    const avatar = resolveCommentAvatar(comment);
    const authorName = comment.userName || 'Community member';
    const username = resolveCommentUsername(comment);

    return (
      <div
        key={comment.id}
        className={`rounded-2xl border border-slate-100 bg-white/70 p-3 shadow-sm ${depth > 0 ? 'ml-5 mt-3' : 'mt-3'}`}
      >
        <div className="flex items-start gap-3">
          <Link to={profileUrl} className="h-10 w-10 overflow-hidden rounded-full bg-slate-100">
            {avatar ? (
              <img src={avatar} alt={authorName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
                {authorName.slice(0, 1)}
              </div>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link to={profileUrl} className="font-semibold text-slate-900 hover:text-slate-700 hover:underline">
                {authorName}
              </Link>
              {username ? <span className="text-xs text-slate-400">@{username}</span> : null}
              {comment.createdAt ? <span className="text-xs text-slate-500">{formatTime(comment.createdAt)}</span> : null}
              {comment.updatedAt && comment.updatedAt !== comment.createdAt && !isDeleted ? (
                <span className="text-[10px] text-slate-400">Edited</span>
              ) : null}
            </div>

            {isEditing ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={editDraft}
                  onChange={(event) => setEditDraft(event.target.value)}
                  className="min-h-[110px] w-full rounded-2xl border border-slate-200 p-3 text-sm text-slate-700"
                />
                <CommentAiAssist value={editDraft} onReplace={setEditDraft} disabled={submitting} scopeLabel="edit" />
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
                    onClick={() => void saveEdit()}
                    disabled={submitting}
                    className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase text-white disabled:opacity-60"
                  >
                    {submitting ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <p className={`mt-2 text-sm ${isDeleted ? 'italic text-slate-400' : 'text-slate-700'}`}>
                {isDeleted ? 'This comment has been deleted.' : <MentionText text={comment.content || ''} />}
              </p>
            )}

            {!isEditing ? (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                {!isDeleted ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!ensureAuth()) return;
                      setReplyToId(comment.id);
                      setReplyDraft('');
                    }}
                    className="inline-flex items-center gap-1 hover:text-blue-600"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Reply
                  </button>
                ) : null}
                {!isDeleted ? (
                  <span className="inline-flex items-center gap-1">
                    <span>{replyCount}</span>
                    <span>replies</span>
                  </span>
                ) : null}
                {!isDeleted ? (
                  <span className="inline-flex items-center gap-1">
                    <span>{reactionCount}</span>
                    <span>reactions</span>
                  </span>
                ) : null}
                {comment.canEdit && !isDeleted ? (
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
                ) : null}
                {comment.canDelete && !isDeleted ? (
                  <button
                    type="button"
                    onClick={() => void deleteComment(comment.id)}
                    className="inline-flex items-center gap-1 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                ) : null}
              </div>
            ) : null}

            {!isDeleted ? (
              <ReactionBar
                targetType="COMMENT"
                targetId={comment.id}
                initialCounts={comment.reactionSummary?.counts}
                initialUserReaction={comment.reactionSummary?.userReaction}
                className="mt-2"
              />
            ) : null}

            {replyToId === comment.id ? (
              <div className="mt-3 space-y-2">
                <textarea
                  value={replyDraft}
                  onChange={(event) => setReplyDraft(event.target.value)}
                  placeholder="Write a public reply..."
                  className="min-h-[110px] w-full rounded-2xl border border-slate-200 p-3 text-sm text-slate-700"
                />
                <CommentAiAssist
                  value={replyDraft}
                  onReplace={setReplyDraft}
                  disabled={submitting}
                  scopeLabel="reply"
                />
                <div className="flex flex-wrap items-center gap-2">
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
                    onClick={() => void submitComment(comment.id)}
                    disabled={submitting}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase text-white disabled:opacity-60"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Reply
                  </button>
                </div>
              </div>
            ) : null}

            {Array.isArray(comment.replies) ? comment.replies.map((reply) => renderComment(reply, depth + 1)) : null}
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen || !scroll) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close comments" />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[28px] bg-white text-slate-900 shadow-2xl sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Scroll comments</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{scroll.title || scroll.description || 'Scroll discussion'}</h3>
            <p className="mt-1 text-xs text-slate-500">
              Public replies show commenter name, username, and profile photo across devices.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Close comments"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
          {!user ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Log in to comment on this Scroll.
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                ref={draftRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a public comment..."
                className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700"
                disabled={submitting}
              />
              <CommentAiAssist value={draft} onReplace={setDraft} disabled={submitting} scopeLabel="comment" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500">{count} public comment{count === 1 ? '' : 's'}</span>
                <button
                  type="button"
                  onClick={() => void submitComment()}
                  disabled={submitting}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-[11px] font-semibold uppercase text-white disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" />
                  {submitting ? 'Posting...' : 'Comment'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-4 sm:px-5">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : comments.length ? (
            comments.map((comment) => renderComment(comment))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              No comments yet. Start the public conversation on this Scroll.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScrollCommentsSheet;
