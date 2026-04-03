import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircleIcon as MessageCircle, Trash2Icon as Trash2, XIcon as X } from '../icons/ShellIcons';
import { CommunityService, type StoryReplyItem } from '../../services/community';
import { useNotification } from '../../context/NotificationContext';
import { resolvePostAttachmentMediaUrl } from '../../utils/postAttachmentMedia';

type Props = {
  open: boolean;
  story: any;
  onClose: () => void;
  onStoryUpdate?: (patch: any) => void;
  presentation?: 'sheet' | 'modal';
  zIndexClassName?: string;
};

const formatRelativeTime = (isoValue?: string | null) => {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs)) return '';
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
};

const fallbackAvatar = (label: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(label || 'Scrolith')}&background=0f172a&color=ffffff`;

type ReplyNodeProps = {
  reply: StoryReplyItem;
  depth?: number;
  onReply: (reply: StoryReplyItem) => void;
  onDelete: (reply: StoryReplyItem) => void;
  deleteBusyId: string | null;
};

function ReplyNode({ reply, depth = 0, onReply, onDelete, deleteBusyId }: ReplyNodeProps) {
  const authorName = String(reply.author?.name || reply.author?.username || 'Scrolith member').trim();
  const avatarUrl =
    resolvePostAttachmentMediaUrl({
      url: reply.author?.avatarUrl || '',
      fileId: reply.author?.avatarFileId || ''
    }) || fallbackAvatar(authorName);
  return (
    <div className={`${depth > 0 ? 'ml-7 border-l border-slate-200 pl-4' : ''}`}>
      <div className="flex gap-3 py-3">
        <img
          src={avatarUrl}
          alt={authorName}
          className="h-9 w-9 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">{authorName}</p>
            <span className="text-xs text-slate-400">{formatRelativeTime(reply.createdAt)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{reply.content}</p>
          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              onClick={() => onReply(reply)}
              className="text-xs font-semibold text-slate-500 transition hover:text-slate-900"
            >
              Reply
            </button>
            {reply.viewerCanDelete ? (
              <button
                type="button"
                onClick={() => onDelete(reply)}
                className="text-xs font-semibold text-rose-500 transition hover:text-rose-600"
                disabled={deleteBusyId === reply.id}
              >
                {deleteBusyId === reply.id ? 'Removing...' : 'Delete'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {Array.isArray(reply.replies) && reply.replies.length
        ? reply.replies.map((child) => (
            <ReplyNode
              key={child.id}
              reply={child}
              depth={depth + 1}
              onReply={onReply}
              onDelete={onDelete}
              deleteBusyId={deleteBusyId}
            />
          ))
        : null}
    </div>
  );
}

export default function StoryReplySheet({
  open,
  story,
  onClose,
  onStoryUpdate,
  presentation = 'sheet',
  zIndexClassName = 'z-[1100]'
}: Props) {
  const { showNotification } = useNotification();
  const storyId = String(story?.id || '').trim();
  const [loading, setLoading] = useState(false);
  const [replies, setReplies] = useState<StoryReplyItem[]>([]);
  const [commentsCount, setCommentsCount] = useState<number>(Number(story?.commentsCount || story?.interactions?.comments || 0));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<StoryReplyItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dispatchStoryReplyCount = useCallback(
    (nextCount: number) => {
      if (!storyId) return;
      const detail = {
        storyId,
        type: 'comment',
        interactions: {
          comments: nextCount
        },
        story: {
          id: storyId,
          commentsCount: nextCount,
          interactions: {
            ...(story?.interactions || {}),
            comments: nextCount
          }
        }
      };
      window.dispatchEvent(new CustomEvent('community:story_engaged', { detail }));
      window.dispatchEvent(new CustomEvent('community:story_updated', { detail: { story: detail.story } }));
    },
    [story?.interactions, storyId]
  );

  const refreshReplies = useCallback(async () => {
    if (!storyId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await CommunityService.getStoryReplies(storyId);
      setReplies(Array.isArray(payload.replies) ? payload.replies : []);
      setCommentsCount(Number(payload.commentsCount || payload.totalReplies || 0));
      onStoryUpdate?.({
        id: storyId,
        commentsCount: Number(payload.commentsCount || payload.totalReplies || 0),
        interactions: {
          ...(story?.interactions || {}),
          comments: Number(payload.commentsCount || payload.totalReplies || 0)
        }
      });
      dispatchStoryReplyCount(Number(payload.commentsCount || payload.totalReplies || 0));
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Unable to load replies.');
    } finally {
      setLoading(false);
    }
  }, [dispatchStoryReplyCount, onStoryUpdate, story?.interactions, storyId]);

  useEffect(() => {
    if (!open || !storyId) return;
    setDraft('');
    setReplyTarget(null);
    void refreshReplies();
  }, [open, storyId, refreshReplies]);

  useEffect(() => {
    setCommentsCount(Number(story?.commentsCount || story?.interactions?.comments || 0));
  }, [story?.commentsCount, story?.interactions?.comments, storyId]);

  const headerLabel = useMemo(() => {
    const count = Number(commentsCount || replies.length || 0);
    return `${count} ${count === 1 ? 'reply' : 'replies'}`;
  }, [commentsCount, replies.length]);

  const submitReply = useCallback(async () => {
    const content = String(draft || '').trim();
    if (!storyId || !content || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await CommunityService.createStoryReply(storyId, {
        content,
        parentId: replyTarget?.id || null
      });
      setDraft('');
      setReplyTarget(null);
      const nextCount = Number(payload.commentsCount || commentsCount + 1);
      setCommentsCount(nextCount);
      onStoryUpdate?.({
        id: storyId,
        commentsCount: nextCount,
        interactions: {
          ...(story?.interactions || {}),
          comments: nextCount
        }
      });
      dispatchStoryReplyCount(nextCount);
      await refreshReplies();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Unable to reply to this story.');
    } finally {
      setBusy(false);
    }
  }, [busy, commentsCount, dispatchStoryReplyCount, draft, onStoryUpdate, refreshReplies, replyTarget?.id, story?.interactions, storyId]);

  const deleteReply = useCallback(
    async (reply: StoryReplyItem) => {
      if (!reply?.id) return;
      setDeleteBusyId(reply.id);
      setError(null);
      try {
        const payload = await CommunityService.deleteStoryReply(reply.id);
        const nextCount = Math.max(0, Number(payload.commentsCount || 0));
        setCommentsCount(nextCount);
        onStoryUpdate?.({
          id: storyId,
          commentsCount: nextCount,
          interactions: {
            ...(story?.interactions || {}),
            comments: nextCount
          }
        });
        dispatchStoryReplyCount(nextCount);
        await refreshReplies();
      } catch (e: any) {
        showNotification('error', 'Stories', e?.response?.data?.error || e?.message || 'Unable to delete reply.');
      } finally {
        setDeleteBusyId(null);
      }
    },
    [dispatchStoryReplyCount, onStoryUpdate, refreshReplies, showNotification, story?.interactions, storyId]
  );

  if (!open) return null;

  return (
    <div className={`fixed inset-0 ${zIndexClassName} flex ${presentation === 'sheet' ? 'items-end justify-center p-3' : 'items-center justify-center p-4'}`}>
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className={`relative w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl ${
          presentation === 'sheet' ? 'max-h-[86dvh]' : 'max-h-[80vh]'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Story replies</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{headerLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[52dvh] overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500">Loading replies...</div>
          ) : error ? (
            <div className="py-6">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</div>
            </div>
          ) : replies.length ? (
            replies.map((reply) => (
              <ReplyNode
                key={reply.id}
                reply={reply}
                onReply={setReplyTarget}
                onDelete={deleteReply}
                deleteBusyId={deleteBusyId}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-slate-500">
              <MessageCircle className="h-8 w-8 text-slate-300" />
              <p>No replies yet. Start the thread.</p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-4 py-4">
          {replyTarget ? (
            <div className="mb-3 flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="truncate">Replying to {replyTarget.author?.name || 'reply'}</span>
              <button type="button" onClick={() => setReplyTarget(null)} className="font-semibold text-slate-900">
                Clear
              </button>
            </div>
          ) : null}
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={presentation === 'sheet' ? 3 : 4}
            placeholder="Write a reply..."
            className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">Replies stay attached to this story instead of being pushed into the feed.</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitReply()}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                disabled={busy || !String(draft || '').trim()}
              >
                {busy ? 'Posting...' : replyTarget ? 'Reply' : 'Comment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
