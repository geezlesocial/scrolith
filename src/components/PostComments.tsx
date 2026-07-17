import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Edit3, Heart, Loader2, MessageCircle, Paperclip, Send, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';
import { CommunityService } from '../services/community';
import { FileService } from '../services/files';
import { ReactionsService } from '../services/reactions';
import ReactionBar from '../community/components/ReactionBar';
import MentionText from '../community/components/MentionText';
import MentionHashtagTextarea from '../community/components/MentionHashtagTextarea';
import { UploadedFile } from '../types';
import CommentAiAssist from './post/CommentAiAssist';
import EmojiPhraseSuggestionBar from '../community/components/EmojiPhraseSuggestionBar';

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

type PendingAttachment = {
  id: string;
  url: string;
  name?: string;
  type?: string;
  mimeType?: string;
};

type CommentPolicy = 'everyone' | 'followers' | 'following' | 'mutuals' | 'none';
type CommentSortMode = 'relevant' | 'newest' | 'oldest';

type PostCommentsProps = {
  postId: string;
  /** Optional club/community scope for @moderators / @admins autocomplete. */
  clubId?: string | null;
  authorId?: string;
  commentPolicy?: string | null;
  initialCount?: number;
  focusCommentId?: string;
  focusMentionToken?: string;
  expanded?: boolean;
  focusInputKey?: number;
  onCountChange?: (postId: string, count: number) => void;
};

const policyLabels: Record<CommentPolicy, string> = {
  everyone: 'Everyone can comment',
  followers: 'Followers can comment',
  following: 'People the author follows can comment',
  mutuals: 'Mutual followers can comment',
  none: 'Comments are disabled'
};

const COMMENT_ATTACHMENT_ACCEPT =
  'image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';

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

const findCommentParentChain = (items: PostComment[], targetId: string, chain: string[] = []): string[] | null => {
  for (const comment of items) {
    if (comment.id === targetId) return chain;
    if (comment.replies?.length) {
      const nested = findCommentParentChain(comment.replies, targetId, [...chain, comment.id]);
      if (nested) return nested;
    }
  }
  return null;
};

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

const resolveCommentAvatar = (comment: PostComment): string | null => {
  const avatar = String(comment.userAvatar || comment.author?.avatar || '').trim();
  return avatar || null;
};

const resolveCommentUsername = (comment: PostComment): string => {
  return String(comment.userUsername || comment.author?.username || '').trim().replace(/^@+/, '');
};

const toTimestamp = (value?: string) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatRelativeTime = (value?: string) => {
  const timestamp = toTimestamp(value);
  if (!timestamp) return '';
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo`;
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y`;
};

const scoreCommentRelevance = (
  comment: PostComment,
  reactionCount: number,
  replyCount: number
) => {
  const ageHours = Math.max(1, (Date.now() - toTimestamp(comment.createdAt)) / 3_600_000);
  const freshnessBoost = Math.max(0, 36 - ageHours) * 0.25;
  return (
    normalizeCount(comment.likesCount) * 2 +
    reactionCount * 2.5 +
    replyCount * 3 +
    freshnessBoost
  );
};

const sortComments = (
  items: PostComment[],
  sortMode: CommentSortMode,
  reactionSummary: Record<string, { counts: Record<string, number>; userReaction: string | null }>,
  depth = 0
): PostComment[] => {
  const sorted = [...items]
    .map((comment) => ({
      ...comment,
      replies: sortComments(comment.replies || [], sortMode, reactionSummary, depth + 1)
    }))
    .sort((left, right) => {
      const leftCreatedAt = toTimestamp(left.createdAt);
      const rightCreatedAt = toTimestamp(right.createdAt);
      if (depth > 0) {
        return leftCreatedAt - rightCreatedAt;
      }
      if (sortMode === 'newest') return rightCreatedAt - leftCreatedAt;
      if (sortMode === 'oldest') return leftCreatedAt - rightCreatedAt;
      const leftReplyCount = countActiveComments(left.replies || []);
      const rightReplyCount = countActiveComments(right.replies || []);
      const leftReactionCount = sumReactionTotals(reactionSummary[left.id]?.counts);
      const rightReactionCount = sumReactionTotals(reactionSummary[right.id]?.counts);
      return (
        scoreCommentRelevance(right, rightReactionCount, rightReplyCount) -
        scoreCommentRelevance(left, leftReactionCount, leftReplyCount)
      );
    });
  return sorted;
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
  clubId = null,
  authorId,
  commentPolicy,
  initialCount = 0,
  focusCommentId,
  focusMentionToken,
  expanded = true,
  focusInputKey,
  onCountChange
}) => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftCaret, setDraftCaret] = useState(0);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyCaret, setReplyCaret] = useState(0);
  const [draftAttachments, setDraftAttachments] = useState<PendingAttachment[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<PendingAttachment[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [commentSortMode, setCommentSortMode] = useState<CommentSortMode>('relevant');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAttachmentCount, setUploadingAttachmentCount] = useState(0);
  const [uploadingAttachmentLabel, setUploadingAttachmentLabel] = useState('');
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
  const expandedRef = useRef(expanded);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const deviceUploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<'draft' | 'reply'>('draft');

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
    const id = String(focusCommentId || replyToId || '').trim();
    if (!id) return;
    const parentChain = findCommentParentChain(comments, id);
    if (!parentChain?.length) return;
    setExpandedReplies((prev) => {
      const next = { ...prev };
      let changed = false;
      parentChain.forEach((parentId) => {
        if (!next[parentId]) {
          next[parentId] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [comments, focusCommentId, replyToId]);

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
    if (!expanded) return;
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
    if (!expanded) return;
    loadComments();
  }, [loadComments, expanded]);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    if (!user?.id) return;
    if (commentsDisabled) return;
    if (typeof focusInputKey === 'undefined' || focusInputKey === null) return;
    const timer = window.setTimeout(() => {
      try {
        draftRef.current?.focus();
      } catch {}
    }, 60);
    return () => window.clearTimeout(timer);
  }, [expanded, focusInputKey, user?.id, commentsDisabled]);

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
    if (!expanded) return;
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

  const sortedComments = useMemo(
    () => sortComments(comments, commentSortMode, commentReactionSummary),
    [comments, commentReactionSummary, commentSortMode]
  );

  const handleSubmit = async (parentId?: string | null) => {
    if (submitLockRef.current) return;
    if (!checkAuth()) return;
    if (uploadingAttachmentCount > 0) {
      showNotification('warning', 'Comments', 'Please wait for your attachment upload to finish.');
      return;
    }
    if (commentsDisabled) {
      showNotification('warning', 'Comments', 'Comments are disabled for this post.');
      return;
    }
    const text = (parentId ? replyDraft : draft).trim();
    const selectedAttachments = parentId ? replyAttachments : draftAttachments;
    const attachmentFileIds = selectedAttachments.map((attachment) => attachment.id).filter(Boolean);
    if (!text && !attachmentFileIds.length) {
      showNotification('warning', 'Comments', 'Please enter a comment or attach media.');
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const created = await CommunityService.commentOnPost(postId, {
        content: text,
        parentId: parentId || null,
        attachmentFileIds
      });
      if (created?.id) {
        const prepared = { ...created, replies: created.replies || [] };
        const shouldIncrease = created.status !== 'deleted' && !commentExists(commentsRef.current, created.id);
        pendingCreatedIdsRef.current.add(String(created.id));
        if (parentId) {
          setExpandedReplies((prev) => ({ ...prev, [String(parentId)]: true }));
        }
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
        setReplyAttachments([]);
        setReplyToId(null);
      } else {
        setDraft('');
        setDraftAttachments([]);
      }
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Unable to comment.';
      showNotification('error', 'Comments', message);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const toPendingAttachment = (file: UploadedFile): PendingAttachment => ({
    id: String(file.id || file.fileId || '').trim(),
    url: String(file.url || '').trim(),
    name: file.name,
    type: file.type,
    mimeType: file.mimeType || file.mime_type
  });

  const addAttachments = useCallback((target: 'draft' | 'reply', files: UploadedFile[]) => {
    const mapped = files.map(toPendingAttachment).filter((item) => item.id && item.url);
    if (!mapped.length) return;
    const setter = target === 'draft' ? setDraftAttachments : setReplyAttachments;
    setter((prev) => {
      const map = new Map<string, PendingAttachment>();
      [...prev, ...mapped].forEach((item) => map.set(item.id, item));
      return Array.from(map.values());
    });
  }, []);

  const removeAttachment = useCallback((target: 'draft' | 'reply', id: string) => {
    const setter = target === 'draft' ? setDraftAttachments : setReplyAttachments;
    setter((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const uploadFilesFromDevice = useCallback(
    async (target: 'draft' | 'reply', files: File[]) => {
      if (!files.length) return;
      setUploadingAttachmentCount(files.length);
      try {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          setUploadingAttachmentLabel(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
          const uploaded = await FileService.uploadFile(file, 'community' as any, {
            role: user?.role,
            visibility: 'public',
            userId: user?.id
          });
          addAttachments(target, [uploaded]);
        }
      } catch (error: any) {
        const message =
          error?.response?.data?.error ||
          error?.response?.data?.message ||
          error?.message ||
          'Unable to upload attachment.';
        showNotification('error', 'Comments', message);
      } finally {
        setUploadingAttachmentCount(0);
        setUploadingAttachmentLabel('');
      }
    },
    [addAttachments, showNotification, user?.id, user?.role]
  );

  const handleDeviceFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.currentTarget.value = '';
      void uploadFilesFromDevice(uploadTargetRef.current, files);
    },
    [uploadFilesFromDevice]
  );

  const openPicker = (target: 'draft' | 'reply') => {
    if (!checkAuth()) return;
    if (commentsDisabled) {
      showNotification('warning', 'Comments', 'Comments are disabled for this post.');
      return;
    }
    uploadTargetRef.current = target;
    deviceUploadInputRef.current?.click();
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

    // When collapsed, keep counts in sync but avoid maintaining a large in-memory comment tree.
    if (expandedRef.current) {
      setComments((prev) => {
        if (!incomingId) return prev;
        if (commentExists(prev, incomingId)) {
          return updateCommentInTree(prev, { ...incoming, replies: incoming.replies || [] });
        }
        return insertComment(prev, { ...incoming, replies: incoming.replies || [] });
      });
    }
    if (shouldIncrease) {
      setCount((prev) => prev + 1);
    }
  }, [postId]);

  const onCommentUpdated = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail || detail.postId !== postId) return;
    const incoming: PostComment = detail.comment || detail;
    if (!expandedRef.current) return;
    setComments((prev) => updateCommentInTree(prev, incoming));
  }, [postId]);

  const onCommentDeleted = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail || detail.postId !== postId) return;
    const commentId = detail.commentId;
    if (!commentId) return;

    if (!expandedRef.current) {
      setCount((prev) => Math.max(0, prev - 1));
      return;
    }
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
    if (!expandedRef.current) return;
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
    if (!expandedRef.current) return;
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

  const renderPendingAttachments = (attachments: PendingAttachment[], target: 'draft' | 'reply') => {
    if (!attachments.length) return null;
    return (
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {attachments.map((media) => {
          const type = inferMediaType(media || {});
          const key = `${target}-${media.id}`;
          const removeButton = (
            <button
              type="button"
              onClick={() => removeAttachment(target, media.id)}
              className="rounded-full bg-white/90 p-1 text-slate-600 shadow hover:text-rose-600"
              title="Remove attachment"
              aria-label="Remove attachment"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          );

          if (type === 'video') {
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-2 py-1">
                  <p className="truncate text-[11px] text-slate-500">{media.name || 'Video'}</p>
                  {removeButton}
                </div>
                <video src={media.url} controls className="h-36 w-full object-cover" />
              </div>
            );
          }

          if (type === 'image') {
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-2 py-1">
                  <p className="truncate text-[11px] text-slate-500">{media.name || 'Image'}</p>
                  {removeButton}
                </div>
                <img src={media.url} alt={media.name || 'Attachment'} className="h-36 w-full object-cover" />
              </div>
            );
          }

          return (
            <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="truncate">{media.name || 'Attachment'}</p>
                {removeButton}
              </div>
              <a href={media.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                View attachment
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
    const commentAuthorAvatar = resolveCommentAvatar(comment);
    const commentAuthorName = comment.userName || comment.author?.name || 'Community member';
    const commentAuthorUsername = resolveCommentUsername(comment);
    const repliesExpanded = !!expandedReplies[comment.id] || replyToId === comment.id;
    const visibleReplies = repliesExpanded ? comment.replies || [] : [];
    return (
      <div
        key={comment.id}
        id={`comment-${comment.id}`}
        className={`mt-4 transition-colors ${depth > 0 ? 'ml-6 border-l border-slate-100 pl-4' : ''}`}
      >
        <div className="flex items-start gap-3">
          <Link to={commentProfileUrl} className="h-10 w-10 overflow-hidden rounded-full bg-slate-100 shadow-sm">
            {commentAuthorAvatar ? (
              <img src={commentAuthorAvatar} alt={commentAuthorName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-500">
                {commentAuthorName.slice(0, 1)}
              </div>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="rounded-3xl border border-slate-100 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <Link to={commentProfileUrl} className="font-semibold text-slate-900 hover:text-slate-700 hover:underline">
                  {commentAuthorName}
                </Link>
                {commentAuthorUsername ? (
                  <span className="truncate text-xs text-slate-400">@{commentAuthorUsername}</span>
                ) : null}
                {comment.createdAt && (
                  <span className="text-xs text-slate-500" title={formatTime(comment.createdAt)}>
                    {formatRelativeTime(comment.createdAt)}
                  </span>
                )}
                {comment.updatedAt && comment.updatedAt !== comment.createdAt && !isDeleted && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    Edited
                  </span>
                )}
              </div>

              {isEditing ? (
                <div className="mt-3 space-y-3">
                  <CommentAiAssist
                    value={editDraft}
                    onReplace={setEditDraft}
                    disabled={submitting}
                    scopeLabel="edit"
                  />
                  <textarea
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    className="min-h-[110px] w-full rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft('');
                      }}
                      className="rounded-full border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleEditSave}
                      disabled={submitting}
                      className="rounded-full bg-slate-900 px-4 py-2 text-[11px] font-semibold uppercase text-white disabled:opacity-60"
                    >
                      {submitting ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`mt-2 text-[15px] leading-6 ${isDeleted ? 'italic text-slate-400' : 'text-slate-800'}`}>
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
                  </div>
                  {!isDeleted && renderAttachments(comment.attachments)}
                </>
              )}
            </div>

            {!isEditing && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 pl-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleLike(comment)}
                  className={`inline-flex items-center gap-1 font-semibold transition hover:text-blue-600 ${
                    comment.likedByMe ? 'text-blue-600' : 'text-slate-500'
                  }`}
                >
                  <Heart className={`h-3.5 w-3.5 ${comment.likedByMe ? 'fill-current' : ''}`} />
                  <span>{normalizeCount(comment.likesCount)}</span>
                </button>
                {!isDeleted && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!checkAuth()) return;
                      setExpandedReplies((prev) => ({ ...prev, [comment.id]: true }));
                      setReplyToId(comment.id);
                      setReplyDraft('');
                      setReplyAttachments([]);
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-slate-500 transition hover:text-slate-900"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Reply
                  </button>
                )}
                {!isDeleted && reactionCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-500">
                    {reactionCount} reactions
                  </span>
                ) : null}
                {!isDeleted && replyCount > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedReplies((prev) => ({
                        ...prev,
                        [comment.id]: !repliesExpanded
                      }))
                    }
                    className="font-semibold text-slate-500 transition hover:text-slate-900"
                  >
                    {repliesExpanded ? 'Hide replies' : `View ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
                  </button>
                ) : null}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(comment.id);
                      setEditDraft(comment.content || '');
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-slate-500 transition hover:text-slate-900"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(comment.id)}
                    className="inline-flex items-center gap-1 font-semibold text-slate-500 transition hover:text-rose-600"
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
                className="mt-2 pl-1"
              />
            ) : null}

            {replyToId === comment.id && (
              <div className="mt-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm">
                <CommentAiAssist
                  value={replyDraft}
                  onReplace={setReplyDraft}
                  disabled={submitting}
                  scopeLabel="reply"
                />
                <MentionHashtagTextarea
                  value={replyDraft}
                  onChange={setReplyDraft}
                  onCaretChange={setReplyCaret}
                  clubId={clubId}
                  mentionsEnabled
                  hashtagsEnabled={false}
                  minQueryLength={0}
                  placeholder={`Reply as ${user?.name || user?.username || 'you'}...`}
                  className="mt-3 min-h-[88px] w-full rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-700 outline-none transition focus:border-slate-300"
                />
                <EmojiPhraseSuggestionBar
                  value={replyDraft}
                  caret={replyCaret}
                  disabled={submitting}
                  onInsert={(nextValue, nextCaret) => {
                    setReplyDraft(nextValue);
                    setReplyCaret(nextCaret);
                  }}
                />
                {renderPendingAttachments(replyAttachments, 'reply')}
                {uploadingAttachmentCount > 0 ? (
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{uploadingAttachmentLabel || 'Uploading attachment...'}</span>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openPicker('reply')}
                    disabled={submitting || uploadingAttachmentCount > 0}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Upload Files
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReplyToId(null);
                        setReplyDraft('');
                        setReplyAttachments([]);
                      }}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSubmit(comment.id)}
                      disabled={submitting || uploadingAttachmentCount > 0}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-[11px] font-semibold uppercase text-white disabled:opacity-60"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Reply
                    </button>
                  </div>
                </div>
              </div>
            )}

            {visibleReplies.map((reply) => renderComment(reply, depth + 1))}
          </div>
        </div>
      </div>
    );
  };

  if (!expanded) return null;

  return (
    <div
      id={`post-${postId}-comments`}
      className="mt-4 rounded-[28px] border border-slate-100 bg-gradient-to-b from-slate-50 to-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.05)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">Comments ({count})</div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">{policyLabel}</div>
        </div>
        <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 shadow-sm">
          <span>Sort</span>
          <select
            value={commentSortMode}
            onChange={(event) => setCommentSortMode(event.target.value as CommentSortMode)}
            className="bg-transparent text-[11px] font-semibold text-slate-700 outline-none"
          >
            <option value="relevant">Most relevant</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </label>
      </div>

      {!user && (
        <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
          Log in to comment on this post.
        </div>
      )}

      {user && (
        <div className="mt-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <CommentAiAssist
            value={draft}
            onReplace={setDraft}
            disabled={commentsDisabled || submitting}
            scopeLabel="comment"
          />
          <MentionHashtagTextarea
            ref={draftRef}
            value={draft}
            onChange={setDraft}
            onCaretChange={setDraftCaret}
            clubId={clubId}
            mentionsEnabled
            hashtagsEnabled={false}
            minQueryLength={0}
            placeholder={
              commentsDisabled
                ? 'Comments are disabled for this post.'
                : `Comment as ${user?.name || user?.username || 'you'} — type @ to mention`
            }
            disabled={commentsDisabled || submitting}
            className="mt-3 min-h-[96px] w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white disabled:bg-slate-100"
          />
          <EmojiPhraseSuggestionBar
            value={draft}
            caret={draftCaret}
            disabled={commentsDisabled || submitting}
            onInsert={(nextValue, nextCaret) => {
              setDraft(nextValue);
              setDraftCaret(nextCaret);
              requestAnimationFrame(() => {
                const el = draftRef.current;
                if (!el) return;
                el.focus();
                try {
                  el.setSelectionRange(nextCaret, nextCaret);
                } catch {
                  /* ignore */
                }
              });
            }}
          />
          {renderPendingAttachments(draftAttachments, 'draft')}
          {uploadingAttachmentCount > 0 ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{uploadingAttachmentLabel || 'Uploading attachment...'}</span>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[32rem] text-xs text-slate-400">
              {commentsDisabled ? 'Only the post author can comment.' : 'Be respectful and keep it constructive.'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openPicker('draft')}
                disabled={commentsDisabled || submitting || uploadingAttachmentCount > 0}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 disabled:opacity-60"
              >
                <Paperclip className="h-4 w-4" />
                Upload Files
              </button>
              <button
                type="button"
                onClick={() => handleSubmit(null)}
                disabled={commentsDisabled || submitting || uploadingAttachmentCount > 0}
                className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-[11px] font-semibold uppercase text-white disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                Comment
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <p className="text-xs text-slate-500">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-slate-500">No comments yet. Be the first to reply.</p>
        ) : (
          sortedComments.map((comment) => renderComment(comment))
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

      <input
        ref={deviceUploadInputRef}
        type="file"
        className="hidden"
        multiple
        accept={COMMENT_ATTACHMENT_ACCEPT}
        onChange={handleDeviceFileInput}
      />
    </div>
  );
};

export default PostComments;
